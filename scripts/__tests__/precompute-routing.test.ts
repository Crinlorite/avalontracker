import { describe, it, expect } from "vitest";
import { bfsToTarget } from "../precompute-routing";

describe("bfsToTarget", () => {
  const adj = new Map<number, number[]>([
    [1, [2]],
    [2, [1, 3]],
    [3, [2, 4]],
    [4, [3]],
  ]);
  it("finds direct target", () => {
    expect(bfsToTarget(1, new Set([2]), adj)).toEqual({ targetId: 2, hops: 1 });
  });
  it("finds distant target", () => {
    expect(bfsToTarget(1, new Set([4]), adj)).toEqual({ targetId: 4, hops: 3 });
  });
  it("returns null if unreachable", () => {
    expect(bfsToTarget(1, new Set([999]), adj)).toBeNull();
  });
  it("excludes start from matches", () => {
    expect(bfsToTarget(1, new Set([1]), adj)).toBeNull();
  });
});
