// The hero's rhythm: hold a script, dissolve into a spoken waveform, re-form as the next script.

export const HOLD = 3.4;
export const TO_WAVE = 1.05;
export const WAVE = 0.55;
export const TO_GLYPH = 1.3;
export const CYCLE = HOLD + TO_WAVE + WAVE + TO_GLYPH;

export interface Moment {
  index: number; // script being shown, or left behind
  next: number; // script being formed
  k1: number; // 0..1 glyph -> waveform
  k2: number; // 0..1 waveform -> next glyph
  local: number; // seconds into this cycle
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function moment(clock: number, count: number): Moment {
  const n = Math.max(1, count);
  const cycle = Math.floor(Math.max(0, clock) / CYCLE);
  const local = Math.max(0, clock) - cycle * CYCLE;
  const index = cycle % n;
  return {
    index,
    next: (index + 1) % n,
    k1: clamp01((local - HOLD) / TO_WAVE),
    k2: clamp01((local - HOLD - TO_WAVE - WAVE) / TO_GLYPH),
    local,
  };
}

// Seconds to add to the clock so a hold ends now; zero once the morph has started.
export function skipToMorph(clock: number): number {
  const local = Math.max(0, clock) % CYCLE;
  return local < HOLD ? HOLD - local : 0;
}

// The label flips halfway through re-forming, when the new script becomes readable.
export function shownIndex(m: Moment): number {
  return m.k2 >= 0.5 ? m.next : m.index;
}
