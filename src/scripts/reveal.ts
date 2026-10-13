// Headings rise out of a mask, word by word, the first time they scroll in.
// Numbers in the metrics count up from zero, keeping their own format.

const STAGGER_MS = 55;

export function mountReveals(still: boolean): void {
  const heads = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
  const wipes = [...document.querySelectorAll<HTMLElement>("[data-wipe]")];
  if (still) return;
  for (const el of heads) {
    const text = el.textContent?.trim() ?? "";
    el.textContent = "";
    for (const [i, word] of text.split(/\s+/).entries()) {
      const mask = document.createElement("span");
      mask.className = "rw";
      const inner = document.createElement("span");
      inner.textContent = word;
      inner.style.setProperty("--d", `${i * STAGGER_MS}ms`);
      mask.append(inner);
      el.append(mask, " ");
    }
  }
  document.documentElement.classList.add("reveals");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  for (const el of [...heads, ...wipes]) io.observe(el);
}

export interface Count {
  prefix: string;
  value: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
}

// Splits "<10 s" or "19,735" or "0.9958" into the number and what surrounds it.
export function parseCount(text: string): Count | null {
  const m = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(text);
  if (!m) return null;
  const raw = m[2] ?? "";
  return {
    prefix: m[1] ?? "",
    value: Number(raw.replace(/,/g, "")),
    decimals: raw.includes(".") ? (raw.split(".")[1]?.length ?? 0) : 0,
    grouped: raw.includes(","),
    suffix: m[3] ?? "",
  };
}

export function formatCount(c: Count, v: number): string {
  const n = c.grouped
    ? v.toLocaleString("en-US", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })
    : v.toFixed(c.decimals);
  return `${c.prefix}${n}${c.suffix}`;
}

const DURATION = 1400;
const easeOut = (x: number) => 1 - (1 - x) ** 4;

export function mountCounts(still: boolean): void {
  if (still) return;
  const items = [...document.querySelectorAll<HTMLElement>("[data-count]")];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const el = e.target as HTMLElement;
        const final = el.textContent ?? "";
        const c = parseCount(final);
        if (!c) continue;
        const t0 = performance.now();
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / DURATION);
          el.textContent = k >= 1 ? final : formatCount(c, c.value * easeOut(k));
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  for (const el of items) io.observe(el);
}
