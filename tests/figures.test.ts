import { describe, expect, test } from "bun:test";
import { baseline, throughput } from "../src/scripts/figures/bandwidth";
import { fuse, RRF_K } from "../src/scripts/figures/rag";
import { allocate } from "../src/scripts/figures/relief";

describe("fuse", () => {
  test("scores a document by 1 / (k + rank) summed over every list it appears in", () => {
    const [top] = fuse([
      ["x", "y"],
      ["x", "z"],
    ]);
    expect(top?.id).toBe("x");
    expect(top?.score).toBeCloseTo(2 / (RRF_K + 1));
  });

  test("ranks agreement above a single strong vote", () => {
    const ids = fuse([
      ["solo", "both"],
      ["other", "both"],
    ]).map((d) => d.id);
    expect(ids.indexOf("both")).toBeLessThan(ids.indexOf("solo"));
  });
});

describe("allocate", () => {
  const need = [300, 250, 200, 160];
  const medical = [false, true, true, false];

  test("never hands out more than the supply", () => {
    const fills = allocate(0.5, need, medical, 800);
    const used = fills.reduce((sum, f, i) => sum + f * (need[i] ?? 0), 0);
    expect(used).toBeLessThanOrEqual(800 + 1e-6);
    expect(used).toBeGreaterThan(780);
  });

  test("the penalty moves supply toward medical need", () => {
    const even = allocate(0, need, medical, 800);
    const tilted = allocate(0.5, need, medical, 800);
    expect(tilted[1] ?? 0).toBeGreaterThan(even[1] ?? 0);
    expect(tilted[0] ?? 0).toBeLessThan(even[0] ?? 0);
  });
});

describe("ABMP baseline", () => {
  test("waits for a full window before judging", () => {
    expect(baseline(10)).toBeNull();
  });

  test("flags the 45.09 MB/s spike and nothing else", () => {
    const flagged: number[] = [];
    for (let i = 20; i < 70; i++) {
      const b = baseline(i);
      if (b && Math.abs((throughput(i) - b.mean) / b.sd) >= 3) flagged.push(throughput(i));
    }
    expect(flagged).toEqual([45.09]);
  });
});
