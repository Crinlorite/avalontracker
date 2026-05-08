import { describe, it, expect } from "vitest";
import { parseIfMatch, VersionMismatchError } from "@/lib/version-check";

describe("parseIfMatch", () => {
  it("returns null for missing header", () => {
    expect(parseIfMatch(null)).toBeNull();
    expect(parseIfMatch(undefined)).toBeNull();
  });

  it("parses 'v=N' format", () => {
    expect(parseIfMatch("v=3")).toBe(3);
    expect(parseIfMatch("v=999")).toBe(999);
  });

  it("returns null for invalid format", () => {
    expect(parseIfMatch("abc")).toBeNull();
    expect(parseIfMatch("v=abc")).toBeNull();
    expect(parseIfMatch("")).toBeNull();
  });
});

describe("VersionMismatchError", () => {
  it("has code CONFLICT and currentVersion", () => {
    const err = new VersionMismatchError(5);
    expect(err.code).toBe("CONFLICT");
    expect(err.currentVersion).toBe(5);
  });
});
