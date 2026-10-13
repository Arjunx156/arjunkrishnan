// VoiceCare: one call, nine agents, inside a ten-second budget.

import { clamp, ease, type Kit, lerp, span, VW } from "./kit";
import type { FigureDef } from "./types";

const LANGS = ["hi-IN", "ml-IN", "ta-IN", "te-IN", "kn-IN", "bn-IN", "mr-IN", "en-IN"];

// Agents in pipeline order, with what each hands on. From the project README.
const AGENTS = [
  { name: "stt", out: "transcript" },
  { name: "intent", out: "delayed shipment" },
  { name: "lookup", out: "ORD-RK24 found" },
  { name: "policy rag", short: "rag", out: "delay policy" },
  { name: "resolve", out: "resolution drafted" },
  { name: "escalate", out: "6 rules checked" },
  { name: "reply", out: "reply composed" },
  { name: "tts", out: "speech out" },
  { name: "ticket", out: "ticket logged" },
];

const ROWS = [160, 246, 332];
const COLS = [96, 300, 504];
// Serpentine through a 3 x 3 grid.
const NODES = AGENTS.map((_, i) => {
  const row = Math.floor(i / 3);
  const col = row % 2 === 0 ? i % 3 : 2 - (i % 3);
  return { x: COLS[col] ?? 0, y: ROWS[row] ?? 0 };
});
const ENTRY = { x: 96, y: 112 };

const SPEAK = [0.3, 1.9] as const;
const TRAVEL = [1.9, 8.2] as const;
const REPLY = [8.2, 9.8] as const;
const BUDGET = 10;

function waveform(k: Kit, x0: number, x1: number, y: number, t: number, level: number, color: string): void {
  const pts: number[] = [];
  for (let x = x0; x <= x1; x += 6) {
    const u = (x - x0) / (x1 - x0);
    const env = Math.sin(Math.PI * u) * Math.abs(Math.sin(u * 9 + t * 7) * Math.sin(u * 3.7 - t * 4.1 + 1));
    const h = 1 + env * 22 * level;
    for (let d = -h; d <= h; d += 3.4) pts.push(x, y + d);
  }
  k.dots(pts, 1.15, color);
}

// Point along the agent path, from 0 (entry) to 1 (last agent).
function along(p: number): { x: number; y: number } {
  const pts = [ENTRY, ...NODES];
  const seg = clamp(p) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(seg));
  const a = pts[i] ?? ENTRY;
  const b = pts[i + 1] ?? ENTRY;
  const f = seg - i;
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}

// Travel moves in hops: glide to an agent, dwell while it works.
function progress(t: number): { p: number; active: number; dwell: number } {
  const hop = (TRAVEL[1] - TRAVEL[0]) / NODES.length;
  const local = clamp(t - TRAVEL[0], 0, TRAVEL[1] - TRAVEL[0] - 1e-6);
  const i = Math.floor(local / hop);
  const f = (local - i * hop) / hop;
  const glide = ease.inOut(clamp(f / 0.62));
  return {
    p: t < TRAVEL[0] ? 0 : t >= TRAVEL[1] ? 1 : (i + glide) / NODES.length,
    active: t < TRAVEL[0] ? -1 : t >= TRAVEL[1] ? NODES.length : f >= 0.62 ? i : i - 1,
    dwell: f >= 0.62 ? span(f, 0.62, 1) : 0,
  };
}

export const voice: FigureDef = {
  loop: 11,
  still: 6.4,
  draw(k, t, round) {
    const lang = LANGS[round % LANGS.length] ?? "hi-IN";
    const elapsed = clamp(t - SPEAK[0], 0, REPLY[1] - SPEAK[0]);
    const done = t >= REPLY[1];
    k.chrome(
      "voicecare / nine-agent pipeline",
      done ? "resolved inside the 10 s budget" : `t+${elapsed.toFixed(1)} s`,
      done ? k.accent() : undefined,
    );

    // The caller.
    const speaking = span(t, SPEAK[0], SPEAK[1]);
    k.text("caller", 18, 66, { color: k.dim() });
    k.text(lang, 18, 92, { size: 12, color: speaking > 0 && speaking < 1 ? k.accent() : k.fg() });
    const inLevel = speaking > 0 && speaking < 1 ? Math.sin(Math.PI * speaking) : 0;
    waveform(k, 150, 560, 88, t, inLevel, k.fg(speaking >= 1 ? 0.35 : 0.9));

    // The track: travelled solid, the rest dashed.
    const { p, active, dwell } = progress(t);
    const steps = 160;
    const path: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const q = along(s / steps);
      path.push(q.x, q.y);
    }
    k.path(path, k.rule(), 1);
    const head = Math.round(p * steps);
    k.path(path.slice(0, (head + 1) * 2), k.fg(0.85), 1.4);

    for (const [i, n] of NODES.entries()) {
      const agent = AGENTS[i];
      if (!agent) continue;
      const reached = i <= active;
      const working = i === active && dwell > 0 && dwell < 1;
      // Outer columns carry the vertical connectors, so their labels sit beside the line, not across it.
      const side = n.x === COLS[0] ? 1 : n.x === COLS[2] ? -1 : 0;
      const align: CanvasTextAlign = side === 1 ? "left" : side === -1 ? "right" : "center";
      const lx = n.x + side * 12;
      const name = k.small && "short" in agent ? agent.short : agent.name;
      k.text(`${String(i + 1).padStart(2, "0")} ${name}`, lx, n.y - 14, {
        align,
        color: reached ? k.fg() : k.dim(),
      });
      if (working) {
        k.ring(n.x, n.y, 7 + dwell * 16, k.accent(1 - dwell), 1.2);
        k.circle(n.x, n.y, 6, k.accent());
      } else {
        k.circle(n.x, n.y, 6, k.rgb(k.pal.bg));
        k.ring(n.x, n.y, 6, reached ? k.fg() : k.dim(0.7), 1.2);
        if (reached) k.circle(n.x, n.y, 2.6, k.fg());
      }
      if (reached && (!working || dwell > 0.35) && !k.small) {
        k.text(agent.out, lx, n.y + 22, { align, color: k.dim(), size: 9.5 });
      }
    }

    // The packet, with a short trail.
    if (t >= TRAVEL[0] && t < TRAVEL[1]) {
      const trail: number[] = [];
      for (let j = 1; j <= 8; j++) {
        const q = along(p - j * 0.006);
        trail.push(q.x, q.y);
      }
      k.dots(trail, 1.6, k.accent(0.35));
      const q = along(p);
      k.circle(q.x, q.y, 3.6, k.accent());
    }

    // The reply, spoken back in the caller's language.
    const replying = span(t, REPLY[0], REPLY[1]);
    const outLevel = replying > 0 && replying < 1 ? Math.sin(Math.PI * replying) : 0;
    k.text("caller hears", 18, 386, { color: k.dim() });
    waveform(k, 150, 560, 382, t * 1.1 + 2, outLevel, k.fg(replying > 0 ? 0.9 : 0.25));

    // The budget.
    const y = 420;
    k.line(18, y, VW - 18, y, k.rule());
    for (let s = 0; s <= BUDGET; s++) {
      const x = lerp(18, VW - 18, s / BUDGET);
      k.line(x, y - 3, x, y + 3, k.dim(0.8));
    }
    const fill = lerp(18, VW - 18, Math.min(elapsed, BUDGET) / BUDGET);
    k.line(18, y, fill, y, k.accent(), 2.4);
    k.text("0", 18, y + 18, { color: k.dim(), size: 9.5 });
    k.text("10 s budget", VW - 18, y + 18, { color: k.dim(), size: 9.5, align: "right" });
  },
};
