import { describe, expect, test } from "bun:test";
import { chapters, notes } from "../src/data/work";

const projects = chapters.flatMap((c) => c.projects);
const links = [...projects.flatMap((p) => p.links), ...notes.flatMap((n) => n.links)];

describe("work data", () => {
  test("project ids are unique", () => {
    const ids = projects.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every project shows at least one measured result and describes its figure", () => {
    for (const p of projects) {
      expect(p.metrics.length).toBeGreaterThan(0);
      expect(p.figureAlt.length).toBeGreaterThan(20);
    }
  });

  test("every outbound link is https", () => {
    for (const l of links) expect(l.href.startsWith("https://")).toBe(true);
  });
});
