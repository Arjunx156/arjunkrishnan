import { expect, test } from "bun:test";
import { clock } from "../src/lib/time";

test("formats the hour and minute in India Standard Time", () => {
  expect(clock(new Date("2026-10-14T15:34:00Z"), "Asia/Kolkata")).toBe("21:04");
});

test("pads early hours to two digits", () => {
  expect(clock(new Date("2026-10-14T20:35:00Z"), "Asia/Kolkata")).toBe("02:05");
});
