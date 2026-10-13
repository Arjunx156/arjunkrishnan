export type Rgb = readonly [number, number, number];

const KEY = "theme";

export function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Reads a hex colour token like --bg into [r, g, b].
export function readColor(token: string): Rgb {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(token).trim().replace("#", "");
  const n = Number.parseInt(hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function save(theme: string): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice just won't persist
  }
}

// One button flips the whole page between ink-on-paper and paper-on-ink.
export function mountInvert(button: HTMLButtonElement): void {
  const root = document.documentElement;
  const sync = () => button.setAttribute("aria-pressed", String(root.dataset.theme === "light"));
  sync();
  button.addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    save(next);
    sync();
    document.dispatchEvent(new Event("themechange"));
  });
}
