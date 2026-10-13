// Relief allocation for five Delhi districts: 800 units against 910 of need, a penalty dial,
// and Dynamic Mode Decomposition catching a blocked route.

import { clamp, ease, type Kit, lerp, span, VW } from "./kit";
import type { FigureDef } from "./types";

const SUPPLY = 800;
const NEED = 910;

// Positions sketch the city; radius stands for need; medical marks districts the penalty favours.
const DISTRICTS = [
  { name: "North", x: 192, y: 104, r: 32, medical: false },
  { name: "West", x: 82, y: 222, r: 29, medical: false },
  { name: "Central", x: 196, y: 214, r: 25, medical: true },
  { name: "East", x: 312, y: 206, r: 31, medical: true },
  { name: "South", x: 188, y: 340, r: 35, medical: false },
];
const HUB = { x: 238, y: 280 };
const BLOCKED = 3;
const BLOCK = [6.2, 10.2] as const;

// Fill per district: an even share of the shortfall, tilted toward medical need by the penalty.
export function allocate(lambda: number, need: number[], medical: boolean[], supply: number): number[] {
  const total = need.reduce((a, b) => a + b, 0);
  const base = Math.min(1, supply / total);
  const tilt = need.map((_, i) => base + lambda * (medical[i] ? 0.12 : -0.06));
  const raw = need.map((n, i) => n * clamp(tilt[i] ?? base, 0, 1));
  const scale = supply / raw.reduce((a, b) => a + b, 0);
  return raw.map((r, i) => clamp((r * Math.min(1, scale)) / (need[i] ?? 1), 0, 1));
}

// Split the 910 units of need in proportion to each district's drawn area.
const AREA = DISTRICTS.reduce((sum, d) => sum + d.r * d.r, 0);
const NEEDS = DISTRICTS.map((d) => (d.r * d.r * NEED) / AREA);
const MEDICAL = DISTRICTS.map((d) => d.medical);

function serviceAt(t: number): number {
  const down = ease.inOut(span(t, BLOCK[0], BLOCK[0] + 1)) * (1 - ease.inOut(span(t, BLOCK[1] - 0.6, BLOCK[1] + 0.6)));
  return lerp(0.963, 0.941, down);
}

function map(k: Kit, t: number, lambda: number, blocked: number): void {
  const fills = allocate(lambda, NEEDS, MEDICAL, SUPPLY);
  for (const [i, d] of DISTRICTS.entries()) {
    const cut = i === BLOCKED ? blocked : 0;
    // Route and moving units.
    const mx = lerp(HUB.x, d.x, 0.5);
    const my = lerp(HUB.y, d.y, 0.5);
    if (cut > 0.5) {
      k.line(HUB.x, HUB.y, d.x, d.y, k.accent(0.9), 1, [3, 4]);
      k.line(mx - 5, my - 5, mx + 5, my + 5, k.accent(), 1.6);
      k.line(mx - 5, my + 5, mx + 5, my - 5, k.accent(), 1.6);
    } else {
      k.line(HUB.x, HUB.y, d.x, d.y, k.fg(0.22));
    }
    const units: number[] = [];
    const n = Math.round(2 + (fills[i] ?? 0) * 4);
    for (let j = 0; j < n; j++) {
      let s = (t * 0.32 + j / n + i * 0.17) % 1;
      if (cut > 0.5) s = Math.min(s, 0.42);
      units.push(lerp(HUB.x, d.x, s), lerp(HUB.y, d.y, s));
    }
    k.dots(units, 1.7, cut > 0.5 ? k.accent() : k.fg(0.85));

    // Need as a ring; what arrived as a rising halftone level.
    const fill = (fills[i] ?? 0) * (1 - cut * 0.1);
    const level = d.y + d.r - fill * 2 * d.r;
    k.circle(d.x, d.y, d.r, k.rgb(k.pal.bg));
    k.halftone(
      d.x - d.r,
      d.y - d.r,
      d.r * 2,
      d.r * 2,
      (x, y) => {
        const inside = (x - d.x) ** 2 + (y - d.y) ** 2 < (d.r - 1.5) ** 2;
        if (!inside) return 0;
        return y > level + Math.sin(x * 0.4 + t * 2.4) * 1.2 ? 0.85 : 0.05;
      },
      3.6,
      d.medical ? k.accent() : k.fg(),
    );
    k.ring(d.x, d.y, d.r, k.fg(0.55), 1);
    k.text(d.name, d.x, d.y + d.r + 14, { align: "center", color: k.dim(), size: 9.5 });
  }
  k.rect(HUB.x - 4, HUB.y - 4, 8, 8, k.fg());
  if (!k.small) k.text("depot", HUB.x + 9, HUB.y + 3.5, { color: k.dim(), size: 9.5 });
}

function dial(k: Kit, lambda: number): void {
  const y = 414;
  const x0 = 40;
  const x1 = 340;
  k.line(x0, y, x1, y, k.rule(), 1);
  for (let i = 0; i <= 10; i++) k.line(lerp(x0, x1, i / 10), y - 2, lerp(x0, x1, i / 10), y + 2, k.dim(0.6));
  const x = lerp(x0, x1, lambda);
  k.line(x0, y, x, y, k.fg(0.8), 1.6);
  k.circle(x, y, 4.2, k.accent());
  k.text("routine", x0, y + 18, { color: k.dim(), size: 9.5 });
  k.text("medical", x1, y + 18, { color: k.dim(), size: 9.5, align: "right" });
  k.text(`penalty λ = ${lambda.toFixed(2)}`, x, y - 10, { align: "center", size: 10 });
}

function eigen(k: Kit, t: number, blocked: number): void {
  const cx = 488;
  const cy = 166;
  const r = 70;
  k.text("dmd eigenvalues", 396, 62, { color: k.dim() });
  k.line(cx - r - 10, cy, cx + r + 10, cy, k.rule());
  k.line(cx, cy - r - 10, cx, cy + r + 10, k.rule());
  k.ring(cx, cy, r, k.fg(0.45), 1);
  k.text("|λ| = 1", cx - r * 0.72 - 4, cy - r * 0.72 - 4, { align: "right", color: k.dim(), size: 9.5 });
  const pts: number[] = [];
  const base = [
    [0.92, 0.6],
    [0.92, -0.6],
    [0.78, 1.5],
    [0.78, -1.5],
    [0.6, 2.6],
    [0.6, -2.6],
    [0.45, 0],
  ];
  for (const [i, [m, a]] of base.entries()) {
    if (i === 0 && blocked > 0) continue;
    const ang = (a ?? 0) + Math.sin(t * 0.4 + i) * 0.04;
    pts.push(cx + Math.cos(ang) * (m ?? 0) * r, cy - Math.sin(ang) * (m ?? 0) * r);
  }
  k.dots(pts, 2.6, k.fg(0.9));
  if (blocked > 0) {
    const m = lerp(0.92, 1.14, blocked);
    const x = cx + Math.cos(0.6) * m * r;
    const y = cy - Math.sin(0.6) * m * r;
    k.ring(x, y, 6 + 4 * Math.sin(t * 6) ** 2, k.accent(0.6), 1);
    k.circle(x, y, 3.2, k.accent());
    k.text(`|λ| ${m.toFixed(2)}`, x - 10, y + 20, { align: "right", color: k.accent(), size: 10 });
  }
}

function service(k: Kit, t: number, loop: number): void {
  const x0 = 396;
  const top = 284;
  k.line(x0, top - 18, VW - 18, top - 18, k.rule());
  k.text(k.small ? "service U" : "urgency-weighted service", x0, top, { color: k.dim() });
  const u = serviceAt(t);
  const degraded = u < 0.962;
  k.text(u.toFixed(3), x0, top + 42, { sans: true, size: 34, weight: 640, color: degraded ? k.accent() : k.fg() });
  const note = degraded ? (k.small ? "route lost" : "route lost: bends, holds") : "baseline 0.951";
  k.text(note, x0, top + 62, { color: k.dim(), size: 9.5 });
  const pts: number[] = [];
  const w = VW - 18 - x0;
  for (let s = 0; s <= t; s += loop / 120) {
    pts.push(x0 + (s / loop) * w, lerp(top + 120, top + 84, (serviceAt(s) - 0.93) / 0.04));
  }
  k.line(x0, top + 120, VW - 18, top + 120, k.rule());
  k.path(pts, degraded ? k.accent() : k.fg(0.8), 1.3);
}

export const relief: FigureDef = {
  loop: 13,
  still: 8.4,
  draw(k, t) {
    k.chrome("relief allocation / five delhi districts", `${SUPPLY} of ${NEED} units`);
    const lambda = lerp(0.1, 0.5, ease.inOut(span(t, 0.8, 3.4)));
    const blocked = ease.inOut(span(t, BLOCK[0], BLOCK[0] + 0.8)) * (1 - ease.inOut(span(t, BLOCK[1], BLOCK[1] + 0.8)));
    map(k, t, lambda, blocked);
    dial(k, lambda);
    eigen(k, t, blocked);
    service(k, t, relief.loop);
  },
};
