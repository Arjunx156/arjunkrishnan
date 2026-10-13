// Battery state of charge: truth, prediction, Monte Carlo dropout doubt, and four attention heads.

import { ease, type Kit, lerp, span, VW } from "./kit";
import type { FigureDef } from "./types";

const X0 = 58;
const X1 = VW - 18;
const Y0 = 58;
const Y1 = 254;
const CYCLES = 2.3;

const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 127.1) * 43758.5453);

// Charge is a slow concave climb; discharge is a near-linear fall with load ripple.
function soc(s: number): { v: number; charging: boolean } {
  const p = fract(s);
  if (p < 0.4) return { v: 0.12 + 0.82 * (1 - (1 - p / 0.4) ** 2.3), charging: true };
  const k = (p - 0.4) / 0.6;
  return { v: 0.94 - 0.82 * k + 0.012 * Math.sin(s * 80), charging: false };
}

const sAt = (x: number) => ((x - X0) / (X1 - X0)) * CYCLES;
const yAt = (v: number) => lerp(Y1, Y0, v);

// Doubt, smoothed so it swells into charging and eases out after.
const SIGMA = (() => {
  const out: number[] = [];
  let sigma = 0.02;
  for (let x = X0; x <= X1; x++) {
    sigma += ((soc(sAt(x)).charging ? 0.075 : 0.018) - sigma) * 0.06;
    out.push(sigma);
  }
  return out;
})();
const sigmaAt = (x: number) => SIGMA[Math.max(0, Math.min(SIGMA.length - 1, Math.round(x - X0)))] ?? 0.02;

const HEADS = ["h1", "h2", "h3", "h4"];
const STEPS = 24;
const DT = 0.018;

// Four heads with different habits: recency, turning points, charging, and a broad context head.
function weights(head: number, s: number): number[] {
  const w: number[] = [];
  for (let j = 0; j < STEPS; j++) {
    const lag = STEPS - 1 - j;
    const at = s - lag * DT;
    const st = soc(at);
    if (head === 0) w.push(Math.exp(-lag / 2.6));
    else if (head === 1) w.push(Math.abs(soc(at + DT).v - 2 * st.v + soc(at - DT).v) * 400);
    else if (head === 2) w.push((st.charging ? 1 : 0.12) * Math.exp(-lag / 14));
    else w.push(0.45 + 0.35 * Math.sin(j * 0.7 + s * 9) * Math.sin(j * 0.23 + 1));
  }
  const max = Math.max(...w, 1e-6);
  return w.map((x) => Math.max(0, x / max));
}

function axes(k: Kit): void {
  for (const pct of [0, 25, 50, 75, 100]) {
    const y = yAt(pct / 100);
    k.line(X0, y, X1, y, k.rule(), 1, pct === 0 ? undefined : [2, 4]);
    k.text(`${pct}`, X0 - 10, y + 3.5, { align: "right", color: k.dim(), size: 9.5 });
  }
  k.text("soc %", X0 - 10, Y0 - 12, { align: "right", color: k.dim(), size: 9.5 });
  k.text("time, held-out 20%", X1, Y1 + 18, { align: "right", color: k.dim(), size: 9.5 });
}

export const charge: FigureDef = {
  loop: 12,
  still: 7.2,
  draw(k, t) {
    k.chrome("battery soc / bilstm + 4-head attention", "R² 0.9958 · RMSE 1.48");
    axes(k);

    const cursor = lerp(X0, X1, ease.inOut(span(t, 0.6, 9.6)));
    const fade = 1 - span(t, 11.2, 12);

    // Doubt band: halftone, vermilion where it swells.
    const inBand = (px: number, py: number) => {
      if (px > cursor) return 0;
      const v = soc(sAt(px)).v;
      const sg = sigmaAt(px);
      const d = Math.abs(py - yAt(v)) / ((yAt(v - sg) - yAt(v + sg)) / 2);
      return d < 1 ? 1 - d * 0.5 : 0;
    };
    k.halftone(
      X0,
      Y0,
      X1 - X0,
      Y1 - Y0,
      (x, y) => (sigmaAt(x) < 0.045 ? inBand(x, y) * 0.55 : 0),
      4.5,
      k.fg(0.5 * fade),
    );
    k.halftone(X0, Y0, X1 - X0, Y1 - Y0, (x, y) => (sigmaAt(x) >= 0.045 ? inBand(x, y) * 0.7 : 0), 4.5, k.accent(fade));

    // Ground truth, then the model's predictions up to the cursor.
    const truth: number[] = [];
    for (let x = X0; x <= X1; x += 2) truth.push(x, yAt(soc(sAt(x)).v));
    k.path(truth, k.fg(0.32), 1);
    const pred: number[] = [];
    for (let x = X0; x <= cursor; x += 6) pred.push(x, yAt(soc(sAt(x)).v) + (hash(x) - 0.5) * 2.4);
    k.dots(pred, 1.7, k.fg(fade));

    // Cursor and readout.
    const now = soc(sAt(cursor));
    const cy = yAt(now.v);
    k.line(cursor, Y0, cursor, Y1, k.fg(0.5 * fade));
    k.circle(cursor, cy, 3.4, now.charging ? k.accent(fade) : k.fg(fade));
    const label = `${(now.v * 100).toFixed(1)}%  ±${(sigmaAt(cursor) * 100).toFixed(1)}  ${now.charging ? "charging" : "discharging"}`;
    const right = cursor > X1 - 200;
    k.text(label, cursor + (right ? -10 : 10), Y0 + 10, {
      align: right ? "right" : "left",
      color: now.charging ? k.accent(fade) : k.fg(fade),
      size: 10,
    });

    // The finding, pinned once the cursor has passed the first charge.
    const pin = X0 + 80;
    const shown = ease.out(span(cursor, pin, pin + 40)) * fade;
    if (shown > 0 && !k.small) {
      const py = yAt(soc(sAt(pin)).v + sigmaAt(pin));
      k.line(pin, py - 4, pin + 26, Y0 + 30, k.accent(shown));
      k.text("doubt rises while charging", pin + 30, Y0 + 33, { color: k.accent(shown), size: 9.5 });
    }

    // Attention over the last 24 steps, recomputed as the cursor moves.
    const top = 306;
    k.line(18, top - 16, X1, top - 16, k.rule());
    k.text("attention over the last 24 steps", 18, top, { color: k.dim() });
    const s = sAt(cursor);
    const colX = (j: number) => lerp(110, X1 - 6, j / (STEPS - 1));
    for (const [h, name] of HEADS.entries()) {
      const y = top + 24 + h * 26;
      k.text(name, 18, y + 3.5, { color: k.dim(), size: 9.5 });
      const w = weights(h, s);
      const best = w.indexOf(Math.max(...w));
      const pts: number[] = [];
      for (const [j, v] of w.entries()) {
        if (j === best) continue;
        k.circle(colX(j), y, 1 + v * 6.2, k.fg((0.25 + 0.75 * v) * fade));
        pts.push(colX(j), y);
      }
      k.dots(pts, 0.8, k.dim(0.6 * fade));
      k.circle(colX(best), y, 7.2, k.accent(fade));
    }
    k.text("now", colX(STEPS - 1), top, { align: "center", color: k.dim(), size: 9.5 });
  },
};
