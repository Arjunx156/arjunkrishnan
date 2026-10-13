import { describe, expect, test } from "bun:test";
import { multiply, perspective, rotateY, transform, translate } from "../src/scripts/hero/mat4";
import { CYCLE, HOLD, moment, shownIndex, skipToMorph, TO_WAVE, WAVE } from "../src/scripts/hero/timeline";

describe("moment", () => {
  test("holds the first script at rest", () => {
    expect(moment(0, 9)).toMatchObject({ index: 0, next: 1, k1: 0, k2: 0 });
  });

  test("dissolves into the waveform after the hold", () => {
    const m = moment(HOLD + TO_WAVE / 2, 9);
    expect(m.k1).toBeCloseTo(0.5);
    expect(m.k2).toBe(0);
  });

  test("lands exactly on the next script at the end of a cycle", () => {
    const end = moment(CYCLE - 1e-9, 9);
    const start = moment(CYCLE, 9);
    expect(end.k2).toBeCloseTo(1);
    expect(start).toMatchObject({ index: 1, k1: 0, k2: 0 });
  });

  test("wraps after the last script", () => {
    expect(moment(CYCLE * 9 + 0.1, 9).index).toBe(0);
    expect(moment(CYCLE * 8 + 0.1, 9).next).toBe(0);
  });

  test("switches the label once the new script is half formed", () => {
    const before = moment(HOLD + TO_WAVE + WAVE + 0.1, 9);
    const after = moment(CYCLE - 0.1, 9);
    expect(shownIndex(before)).toBe(0);
    expect(shownIndex(after)).toBe(1);
  });
});

describe("skipToMorph", () => {
  test("jumps to the end of the hold", () => {
    expect(skipToMorph(1)).toBeCloseTo(HOLD - 1);
    expect(moment(1 + skipToMorph(1), 9).local).toBeCloseTo(HOLD);
  });

  test("does nothing once a morph is under way", () => {
    expect(skipToMorph(HOLD + 0.2)).toBe(0);
  });
});

describe("mat4", () => {
  test("translation moves a point", () => {
    expect(transform(translate(1, 2, 3), 1, 1, 1)).toEqual([2, 3, 4, 1]);
  });

  test("a quarter turn about y sends +x to -z", () => {
    const [x, , z] = transform(rotateY(Math.PI / 2), 1, 0, 0);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });

  test("perspective puts a point on the axis at the centre of the screen", () => {
    const mvp = multiply(perspective(0.5, 1.5, 0.1, 50), translate(0, 0, -5));
    const [x, y, , w] = transform(mvp, 0, 0, 0);
    expect(x / w).toBeCloseTo(0);
    expect(y / w).toBeCloseTo(0);
    expect(w).toBeCloseTo(5);
  });
});
