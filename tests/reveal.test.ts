import { describe, expect, test } from "bun:test";
import { formatCount, parseCount } from "../src/scripts/reveal";

describe("parseCount", () => {
  test("keeps what surrounds the number", () => {
    expect(parseCount("<10 s")).toMatchObject({ prefix: "<", value: 10, suffix: " s" });
    expect(parseCount("45.09 MB/s")).toMatchObject({ value: 45.09, decimals: 2, suffix: " MB/s" });
  });

  test("reads grouped thousands", () => {
    expect(parseCount("19,735")).toMatchObject({ value: 19735, grouped: true });
  });

  test("returns null when there is nothing to count", () => {
    expect(parseCount("n/a")).toBeNull();
  });
});

describe("formatCount", () => {
  test("lands exactly on the original text", () => {
    for (const s of ["<10 s", "0.9958", "19,735", "84%", "512-bit", "$0", "3 SD", "45.09 MB/s"]) {
      const c = parseCount(s);
      expect(c).not.toBeNull();
      if (c) expect(formatCount(c, c.value)).toBe(s);
    }
  });

  test("keeps decimals while counting", () => {
    const c = parseCount("0.9958");
    if (c) expect(formatCount(c, 0.5)).toBe("0.5000");
  });
});
