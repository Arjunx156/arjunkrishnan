// ABMP: live throughput, a learned 3-sigma band, the protocol's state machine and its JSON data units.

import { type Kit, lerp, VW } from "./kit";
import type { FigureDef } from "./types";

const X0 = 58;
const X1 = VW - 18;
const Y0 = 58;
const Y1 = 246;
const WINDOW = 20; // samples in the rolling baseline (the protocol uses 20 s)
const SHOWN = 60;
const RATE = 5; // samples per animation second: 5x real time
const SPIKE_AT = 46;
const SPIKE = 45.09;
const MAX = 50;

const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 91.7 + 4.4) * 43758.5453);

export function throughput(i: number): number {
  if (i === SPIKE_AT) return SPIKE;
  return 9.5 + 3.4 * (hash(i) - 0.5) + 0.35 * Math.sin(i * 0.05);
}

export interface Stats {
  mean: number;
  sd: number;
}

// Mean and spread of the WINDOW samples before i; null until there are enough.
export function baseline(i: number): Stats | null {
  if (i < WINDOW) return null;
  let sum = 0;
  for (let j = i - WINDOW; j < i; j++) sum += throughput(j);
  const mean = sum / WINDOW;
  let sq = 0;
  for (let j = i - WINDOW; j < i; j++) sq += (throughput(j) - mean) ** 2;
  return { mean, sd: Math.sqrt(sq / (WINDOW - 1)) }; // sample standard deviation
}

type State = "calibration" | "monitoring" | "violation";

function stateAt(i: number): State {
  const b = baseline(i);
  if (!b) return "calibration";
  for (let j = i; j > i - 6 && j >= WINDOW; j--) {
    const s = baseline(j);
    if (s && Math.abs((throughput(j) - s.mean) / s.sd) >= 3) return "violation";
  }
  return "monitoring";
}

const yAt = (v: number) => lerp(Y1, Y0, v / MAX);

function chart(k: Kit, latest: number): void {
  for (const v of [0, 10, 20, 30, 40, 50]) {
    k.line(X0, yAt(v), X1, yAt(v), k.rule(), 1, v === 0 ? undefined : [2, 4]);
    k.text(`${v}`, X0 - 10, yAt(v) + 3.5, { align: "right", color: k.dim(), size: 9.5 });
  }
  k.text("MB/s", X0 - 10, Y0 - 12, { align: "right", color: k.dim(), size: 9.5 });
  k.text("5x speed, 1 sample/s", X1, Y1 + 18, { align: "right", color: k.dim(), size: 9.5 });

  const w = (X1 - X0) / SHOWN;
  const xOf = (i: number) => X1 - (latest - i + 0.5) * w;
  const upper: number[] = [];
  const mean: number[] = [];
  const lower: number[] = [];
  for (let i = Math.max(0, latest - SHOWN + 1); i <= latest; i++) {
    const b = baseline(i);
    if (!b) continue;
    const x = xOf(i);
    upper.push(x, yAt(Math.min(MAX, b.mean + 3 * b.sd)));
    mean.push(x, yAt(b.mean));
    lower.push(x, yAt(Math.max(0, b.mean - 3 * b.sd)));
  }
  k.path(mean, k.fg(0.35), 1);
  const g = k.ctx;
  g.setLineDash([3 * k.hair, 3 * k.hair]);
  k.path(upper, k.fg(0.7), 1);
  k.path(lower, k.fg(0.45), 1);
  g.setLineDash([]);

  for (let i = Math.max(0, latest - SHOWN + 1); i <= latest; i++) {
    const v = throughput(i);
    const b = baseline(i);
    const hot = b !== null && Math.abs((v - b.mean) / b.sd) >= 3;
    const x = xOf(i);
    const pts: number[] = [];
    for (let y = Y1 - 2; y >= yAt(v); y -= 3.6) pts.push(x, y);
    k.dots(pts, 1.15, hot ? k.accent() : k.fg(i === latest ? 1 : 0.72));
    if (hot && b) {
      k.ring(x, yAt(v), 7, k.accent(0.7), 1);
      k.text(`${v.toFixed(2)} MB/s, z ${((v - b.mean) / b.sd).toFixed(1)}`, x - 12, yAt(v) + 4, {
        align: "right",
        color: k.accent(),
        size: 10,
      });
    }
  }
}

function machine(k: Kit, state: State): void {
  const y = 286;
  const names: State[] = ["calibration", "monitoring", "violation"];
  const bw = 156;
  const xs = [18, 222, 426];
  for (const [i, name] of names.entries()) {
    const x = xs[i] ?? 0;
    const on = name === state;
    const color = name === "violation" ? k.accent() : k.fg();
    if (on) k.rect(x, y, bw, 28, color);
    else k.box(x, y, bw, 28, k.fg(0.35));
    k.text(name, x + bw / 2, y + 18, { align: "center", color: on ? k.rgb(k.pal.bg) : k.dim(), size: 10.5 });
    if (i < names.length - 1) {
      const ax = x + bw + 6;
      const bx = (xs[i + 1] ?? 0) - 6;
      k.line(ax, y + 14, bx, y + 14, k.fg(0.5));
      k.line(bx - 5, y + 10, bx, y + 14, k.fg(0.5));
      k.line(bx - 5, y + 18, bx, y + 14, k.fg(0.5));
    }
  }
  // Violation falls back to monitoring once traffic settles.
  const from = (xs[2] ?? 0) + bw / 2;
  const to = (xs[1] ?? 0) + bw / 2;
  const g = k.ctx;
  g.strokeStyle = k.fg(0.35);
  g.lineWidth = k.hair;
  g.beginPath();
  g.moveTo(from, y + 32);
  g.quadraticCurveTo((from + to) / 2, y + 52, to, y + 32);
  g.stroke();
}

function pdu(i: number, compact: boolean): string {
  const b = baseline(i);
  const v = throughput(i);
  const z = b ? (v - b.mean) / b.sd : 0;
  const sec = 7 + i;
  const ts = `14:02:${String(sec % 60).padStart(2, "0")}`;
  const body = `"mbps":${v.toFixed(2)},"z":${z.toFixed(2)},"status":"${stateAt(i).toUpperCase()}"`;
  return compact ? `{${body}}` : `{"ts":"${ts}",${body}}`;
}

function log(k: Kit, latest: number): void {
  const y = 370;
  k.text("protocol data units, one per sample", 18, y, { color: k.dim() });
  for (let r = 0; r < 3; r++) {
    const i = latest - 2 + r;
    if (i < 0) continue;
    const hot = i === SPIKE_AT;
    k.text(pdu(i, k.small), 18, y + 22 + r * 18, { size: 9.5, color: hot ? k.accent() : k.fg(r === 2 ? 1 : 0.55) });
  }
}

export const bandwidth: FigureDef = {
  loop: 14,
  still: 9.4,
  draw(k, t) {
    const latest = Math.min(69, Math.floor(t * RATE));
    const state = stateAt(latest);
    k.chrome(
      "abmp / live nic throughput",
      state,
      state === "violation" ? k.accent() : state === "calibration" ? k.dim() : k.fg(),
    );
    chart(k, latest);
    machine(k, state);
    log(k, latest);
  },
};
