import { clock } from "../lib/time";

export function mountClock(el: HTMLElement, timeZone: string): void {
  const tick = () => {
    el.textContent = clock(new Date(), timeZone);
  };
  tick();
  setInterval(tick, 10_000);
}

// Copies the address; falls back to selecting it when the clipboard is unavailable.
export function mountCopy(button: HTMLButtonElement, target: HTMLElement, status: HTMLElement): void {
  const label = button.textContent ?? "";
  let timer = 0;

  const say = (text: string) => {
    button.textContent = text;
    status.textContent = text;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      button.textContent = label;
      status.textContent = "";
    }, 2400);
  };

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(target.textContent?.trim() ?? "");
      say("Copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(target);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      say("Selected, press Ctrl+C");
    }
  });
}
