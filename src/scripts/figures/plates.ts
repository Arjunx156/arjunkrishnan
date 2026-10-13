// Runs the project figures: only while on screen, each story starting when it first scrolls in.

import type { Figure } from "../../data/work";
import { reducedMotion } from "../theme";
import { bandwidth } from "./bandwidth";
import { charge } from "./charge";
import { exchange } from "./exchange";
import { Kit, palette } from "./kit";
import { rag } from "./rag";
import { relief } from "./relief";
import type { FigureDef } from "./types";
import { voice } from "./voice";

const FIGURES: Record<Figure, FigureDef> = {
  voice,
  fusion: rag,
  charge,
  relief,
  intercept: exchange,
  spike: bandwidth,
};

const DPR_CAP = 2;

interface Plate {
  kit: Kit;
  def: FigureDef;
  frame: HTMLElement;
  visible: boolean;
  start: number | null; // when it first came into view
  paused: number | null; // when it was paused
  idle: number; // total ms spent paused
}

const isFigure = (v: string | undefined): v is Figure => v !== undefined && v in FIGURES;

function draw(p: Plate, now: number, still: boolean): void {
  const def = p.def;
  let t = def.still;
  let round = 0;
  if (!still) {
    const at = p.paused ?? now;
    const elapsed = Math.max(0, (at - (p.start ?? at) - p.idle) / 1000);
    round = Math.floor(elapsed / def.loop);
    t = elapsed - round * def.loop;
  }
  p.kit.clear();
  def.draw(p.kit, t, round);
}

function size(p: Plate): void {
  p.kit.resize(p.frame.clientWidth, Math.min(devicePixelRatio || 1, DPR_CAP));
}

export async function mountFigures(): Promise<void> {
  const still = reducedMotion();
  const pal = palette();
  const plates: Plate[] = [];
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>("canvas[data-figure]")) {
    const name = canvas.dataset.figure;
    const ctx = canvas.getContext("2d");
    const frame = canvas.parentElement;
    if (!isFigure(name) || !ctx || !frame) continue;
    plates.push({
      kit: new Kit(ctx, pal),
      def: FIGURES[name],
      frame,
      visible: false,
      start: null,
      paused: null,
      idle: 0,
    });
  }
  if (plates.length === 0) return;

  // Canvas text needs the faces loaded before the first frame.
  await Promise.all([document.fonts.load('10px "Fragment Mono"'), document.fonts.load('600 14px "Mona Sans"')]);

  let raf = 0;
  const tick = (now: number) => {
    raf = 0;
    const live = plates.filter((p) => p.visible && p.paused === null);
    if (live.length === 0 || document.hidden) return;
    for (const p of live) draw(p, now, false);
    raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (!still && !raf) raf = requestAnimationFrame(tick);
  };

  const byFrame = (el: Element) => plates.find((p) => p.frame === el);

  const io = new IntersectionObserver(
    (entries) => {
      const now = performance.now();
      for (const e of entries) {
        const p = byFrame(e.target);
        if (!p) continue;
        p.visible = e.isIntersecting;
        if (p.visible && p.start === null) p.start = now;
        if (p.visible) draw(p, now, still);
      }
      wake();
    },
    { rootMargin: "60px 0px" },
  );

  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const p = byFrame(e.target);
      if (!p) continue;
      size(p);
      if (p.visible || still) draw(p, performance.now(), still);
    }
  });

  for (const p of plates) {
    size(p);
    io.observe(p.frame);
    ro.observe(p.frame);
    const button = p.frame.closest("figure")?.querySelector<HTMLButtonElement>("[data-figure-pause]");
    if (!button) continue;
    if (still) {
      button.remove();
      continue;
    }
    button.addEventListener("click", () => {
      const now = performance.now();
      if (p.paused === null) {
        p.paused = now;
      } else {
        p.idle += now - p.paused;
        p.paused = null;
      }
      const on = p.paused !== null;
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "Play" : "Pause";
      wake();
    });
  }

  document.addEventListener("visibilitychange", wake);
  document.addEventListener("themechange", () => {
    const next = palette();
    const now = performance.now();
    for (const p of plates) {
      p.kit.pal = next;
      if (p.visible) draw(p, now, still);
    }
  });
}
