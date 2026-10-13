import { site } from "../data/site";
import { mountFigures } from "./figures/plates";
import { SCRIPTS } from "./hero/glyphs";
import { mountHero } from "./hero/particles";
import { mountCounts, mountReveals } from "./reveal";
import { createSound } from "./sound";
import { mountStage } from "./stage/stage";
import { mountInvert, reducedMotion } from "./theme";
import { mountClock, mountCopy } from "./ui";

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector);
const $$ = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)];

const invert = $<HTMLButtonElement>("[data-invert]");
if (invert) mountInvert(invert);

const time = $<HTMLElement>("[data-clock]");
if (time) mountClock(time, site.timeZone);

const copy = $<HTMLButtonElement>("[data-copy]");
const address = $<HTMLElement>("[data-address]");
const status = $<HTMLElement>("[data-copy-status]");
if (copy && address && status) mountCopy(copy, address, status);

const still = reducedMotion();
mountReveals(still);
mountCounts(still);

const fmt = new Intl.NumberFormat("en-IN");

function label(prefix: "" | "hello-", i: number, word: (i: number) => string): void {
  const s = SCRIPTS[i];
  if (!s) return;
  const index = $(`[data-${prefix}index]`);
  const lang = $(`[data-${prefix}lang]`);
  const native = $(`[data-${prefix}native]`);
  if (index) index.textContent = String(i + 1).padStart(2, "0");
  if (lang) lang.textContent = s.lang;
  if (native) native.textContent = word(i);
  if (prefix === "") {
    for (const [n, tick] of $$("[data-tick]").entries()) {
      tick.classList.toggle("on", n === i);
      tick.classList.toggle("done", n < i);
    }
  }
}

function stats(n: number, f: number): void {
  const particles = $("[data-particles]");
  const fps = $("[data-fps]");
  if (particles) particles.textContent = fmt.format(n);
  if (fps) fps.textContent = String(f);
}

interface Motion {
  still: boolean;
  next(): void;
  setPaused(p: boolean): void;
}

// Next and Pause buttons appear in the hero and the contact section; all of them drive the same motion.
function controls(m: Motion): void {
  for (const b of $$<HTMLButtonElement>("[data-next]")) b.addEventListener("click", () => m.next());
  const pauses = $$<HTMLButtonElement>("[data-pause]");
  if (m.still) {
    for (const b of pauses) b.remove();
    const s = $(".stats");
    if (s) s.textContent = "Held still for reduced motion. Next script still works.";
    return;
  }
  let paused = false;
  for (const b of pauses) {
    b.addEventListener("click", () => {
      paused = !paused;
      m.setPaused(paused);
      for (const other of pauses) {
        other.setAttribute("aria-pressed", String(paused));
        other.textContent = paused ? "Play" : "Pause";
      }
    });
  }
}

function sound(): ReturnType<typeof createSound> | null {
  const button = $<HTMLButtonElement>("[data-sound]");
  if (!button || still || !("AudioContext" in window)) return null;
  const s = createSound();
  button.hidden = false;
  button.addEventListener("click", () => button.setAttribute("aria-pressed", String(s.toggle())));
  return s;
}

// The single-word hero for pages without the full stage (the 404), and for browsers without WebGL2.
function lite(word?: string): void {
  const canvas = $<HTMLCanvasElement>("[data-hero]");
  const surface = $<HTMLElement>("[data-hero-surface]");
  if (!canvas || !surface) return;
  mountHero(canvas, surface, {
    scripts: word ? [{ lang: "", word, hello: word, family: "Mona Sans" }] : SCRIPTS,
    loop: !word,
    onScript: word ? undefined : (i) => label("", i, (n) => SCRIPTS[n]?.word ?? ""),
    onStats: stats,
  }).then(controls, () => {
    canvas.remove();
    for (const el of $$("[data-next], [data-pause], .stats")) el.remove();
  });
}

function start(): void {
  const world = $<HTMLCanvasElement>("[data-stage]");
  const surface = $<HTMLElement>("[data-hero-surface]");
  if (!world) {
    lite(surface?.dataset.word);
    return;
  }
  const audio = sound();
  mountStage(world, {
    onScript: (cycle, i) =>
      cycle === "name"
        ? label("", i, (n) => SCRIPTS[n]?.word ?? "")
        : label("hello-", i, (n) => SCRIPTS[n]?.hello ?? ""),
    onStats: stats,
    onPulse: (e) => audio?.pulse(e),
    onMorph: (_, i) => audio?.chime(i),
  }).then(
    (stage) => {
      $("[data-hero]")?.remove();
      controls(stage);
    },
    () => {
      world.remove();
      lite();
    },
  );
}

// Heavy work waits for load and idle time, so the text paints first.
const later = (fn: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200);

const boot = () => {
  later(start);
  later(mountFigures);
};

if (document.readyState === "complete") boot();
else addEventListener("load", boot, { once: true });
