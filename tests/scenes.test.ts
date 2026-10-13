import { describe, expect, test } from "bun:test";
import { frame, halfExtents, isScene, PHONE, SCENES, toShape, WORD_W } from "../src/scripts/stage/scenes";

describe("frame", () => {
  test("fits the widest word inside the desktop width", () => {
    const f = frame(SCENES.name, 1440, 900);
    const { hw } = halfExtents(1440 / 900);
    expect(WORD_W * f.scale).toBeLessThanOrEqual(2 * hw * 0.7 + 1e-9);
  });

  test("uses the phone placement and dimmer shapes under the phone breakpoint", () => {
    const f = frame(SCENES.orb, PHONE - 1, 800);
    expect(f.anchor).toEqual([SCENES.orb.phone[0], SCENES.orb.phone[1]]);
    expect(f.intensity).toBe(SCENES.orb.phoneIntensity);
  });

  test("puts chapter shapes to the right of the text on desktop", () => {
    for (const name of ["orb", "terrain", "knot"] as const) {
      expect(frame(SCENES[name], 1440, 900).anchor[0]).toBeGreaterThan(0.3);
    }
  });
});

describe("toShape", () => {
  test("maps the scene anchor to the shape's origin", () => {
    const f = frame(SCENES.knot, 1440, 900);
    const [x, y] = toShape(f.anchor, f, 1440 / 900);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });

  test("is linear in screen position", () => {
    const f = frame(SCENES.name, 1200, 800);
    const a = toShape([0.2, 0.1], f, 1.5);
    const b = toShape([0.4, 0.3], f, 1.5);
    const c = toShape([0.6, 0.5], f, 1.5);
    expect(c[0] - b[0]).toBeCloseTo(b[0] - a[0]);
    expect(c[1] - b[1]).toBeCloseTo(b[1] - a[1]);
  });
});

test("isScene accepts only known scenes", () => {
  expect(isScene("hello")).toBe(true);
  expect(isScene("nope")).toBe(false);
  expect(isScene(undefined)).toBe(false);
});
