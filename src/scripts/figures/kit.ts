// A small drawing kit for the project figures. Every figure draws in a fixed 600 x 450 space;
// the kit scales it to the canvas and keeps hairlines one device pixel wide.

import { type Rgb, readColor } from "../theme";

export const VW = 600;
export const VH = 450;

export interface Palette {
  bg: Rgb;
  fg: Rgb;
  muted: Rgb;
  line: Rgb;
  accent: Rgb;
}

export function palette(): Palette {
  return {
    bg: readColor("--bg"),
    fg: readColor("--fg"),
    muted: readColor("--muted"),
    line: readColor("--line"),
    accent: readColor("--accent"),
  };
}

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
// 0..1 progress of t through [a, b].
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const ease = {
  out: (x: number) => 1 - (1 - x) ** 3,
  in: (x: number) => x ** 3,
  inOut: (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
};

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  sans?: boolean;
  weight?: number;
}

export class Kit {
  readonly ctx: CanvasRenderingContext2D;
  pal: Palette;
  scale = 1; // CSS px per virtual unit
  hair = 1; // one CSS pixel, in virtual units
  small = false; // narrow screens drop secondary labels

  constructor(ctx: CanvasRenderingContext2D, pal: Palette) {
    this.ctx = ctx;
    this.pal = pal;
  }

  resize(cssWidth: number, dpr: number): void {
    const c = this.ctx.canvas;
    c.width = Math.round(cssWidth * dpr);
    c.height = Math.round(((cssWidth * VH) / VW) * dpr);
    this.scale = cssWidth / VW;
    this.hair = 1 / this.scale;
    this.small = cssWidth < 460;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
  }

  clear(): void {
    this.ctx.fillStyle = this.rgb(this.pal.bg);
    this.ctx.fillRect(0, 0, VW, VH);
    const grid: number[] = [];
    for (let y = 48; y < VH; y += 24) for (let x = 18; x <= VW - 18; x += 24) grid.push(x, y);
    this.dots(grid, 0.55, this.fg(0.1));
  }

  rgb(c: Rgb, a = 1): string {
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  fg(a = 1): string {
    return this.rgb(this.pal.fg, a);
  }
  dim(a = 1): string {
    return this.rgb(this.pal.muted, a);
  }
  accent(a = 1): string {
    return this.rgb(this.pal.accent, a);
  }
  rule(a = 1): string {
    return this.rgb(this.pal.line, a);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, dash?: number[]): void {
    const g = this.ctx;
    g.strokeStyle = color;
    g.lineWidth = width * this.hair;
    g.setLineDash(dash ? dash.map((d) => d * this.hair) : []);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.setLineDash([]);
  }

  path(points: readonly number[], color: string, width = 1): void {
    if (points.length < 4) return;
    const g = this.ctx;
    g.strokeStyle = color;
    g.lineWidth = width * this.hair;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(points[0] ?? 0, points[1] ?? 0);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
    g.stroke();
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  box(x: number, y: number, w: number, h: number, color: string, width = 1): void {
    const g = this.ctx;
    g.strokeStyle = color;
    g.lineWidth = width * this.hair;
    g.strokeRect(x, y, w, h);
  }

  circle(x: number, y: number, r: number, color: string): void {
    const g = this.ctx;
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  ring(x: number, y: number, r: number, color: string, width = 1): void {
    const g = this.ctx;
    g.strokeStyle = color;
    g.lineWidth = width * this.hair;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  }

  // Many dots, one fill: flat [x0, y0, x1, y1, ...].
  dots(points: readonly number[], r: number, color: string): void {
    const g = this.ctx;
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i] ?? 0;
      const y = points[i + 1] ?? 0;
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
    g.fill();
  }

  // Halftone: a grid of dots whose size follows f(x, y) in 0..1.
  halftone(
    x: number,
    y: number,
    w: number,
    h: number,
    f: (x: number, y: number) => number,
    pitch: number,
    color: string,
  ) {
    const g = this.ctx;
    g.fillStyle = color;
    g.beginPath();
    const x0 = Math.ceil(x / pitch) * pitch;
    const y0 = Math.ceil(y / pitch) * pitch;
    for (let py = y0; py < y + h; py += pitch) {
      for (let px = x0; px < x + w; px += pitch) {
        const v = f(px, py);
        if (v <= 0.02) continue;
        const r = pitch * 0.48 * Math.sqrt(Math.min(1, v));
        g.moveTo(px + r, py);
        g.arc(px, py, r, 0, Math.PI * 2);
      }
    }
    g.fill();
  }

  text(s: string, x: number, y: number, o: TextOpts = {}): number {
    const g = this.ctx;
    // Never below 9 CSS px (8 on phones), however small the figure gets.
    const size = Math.max(o.size ?? 10, (this.small ? 8 : 9) / this.scale);
    const family = o.sans ? '"Mona Sans", sans-serif' : '"Fragment Mono", ui-monospace, monospace';
    g.font = `${o.weight ?? (o.sans ? 560 : 400)} ${size}px ${family}`;
    g.fillStyle = o.color ?? this.fg();
    g.textAlign = o.align ?? "left";
    g.textBaseline = o.base ?? "alphabetic";
    g.fillText(s, x, y);
    return g.measureText(s).width;
  }

  // Base with a raised exponent, for g^ab and friends. Returns the total width.
  power(base: string, exp: string, x: number, y: number, o: TextOpts = {}): number {
    const size = o.size ?? 11;
    const w = this.text(base, x, y, { ...o, align: "left" });
    const e = this.text(exp, x + w + 0.5, y - size * 0.42, { ...o, align: "left", size: size * 0.72 });
    return w + e + 0.5;
  }

  // Figure chrome: a label on the left, a live readout on the right, a hairline under both.
  chrome(left: string, right: string, rightColor?: string): void {
    // On phones the caption below already names the figure; keep the live readout.
    if (!this.small) this.text(left, 18, 26, { color: this.dim() });
    this.text(right, VW - 18, 26, { align: "right", color: rightColor ?? this.fg() });
    this.line(18, 36, VW - 18, 36, this.rule());
  }
}
