import { describe, it, expect } from "vitest";
import { minutesLeft, colorForMinutes, formatCountdown } from "@/lib/time";

describe("minutesLeft", () => {
  it("returns positive minutes when in future", () => {
    const future = new Date(Date.now() + 45 * 60_000);
    expect(minutesLeft(future)).toBeCloseTo(45, 0);
  });
  it("returns negative when past", () => {
    const past = new Date(Date.now() - 10 * 60_000);
    expect(minutesLeft(past)).toBeLessThan(0);
  });
});

describe("colorForMinutes", () => {
  it("green > 60", () => { expect(colorForMinutes(90)).toBe("#22c55e"); });
  it("orange 30-60", () => { expect(colorForMinutes(45)).toBe("#f97316"); });
  it("red 0-30", () => { expect(colorForMinutes(10)).toBe("#ef4444"); });
  it("blue (expired) <=0", () => { expect(colorForMinutes(0)).toBe("#3b82f6"); expect(colorForMinutes(-5)).toBe("#3b82f6"); });
});

describe("formatCountdown", () => {
  it("H:MM:SS when >= 1h", () => { expect(formatCountdown(3725)).toBe("1:02:05"); });
  it("MM:SS when < 1h", () => { expect(formatCountdown(125)).toBe("02:05"); });
  it("0:00 when negative", () => { expect(formatCountdown(-10)).toBe("0:00"); });
});
