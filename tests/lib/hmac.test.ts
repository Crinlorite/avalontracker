import { describe, it, expect } from "vitest";
import { signBody, verifySignature } from "@/lib/hmac";

const SECRET = "test-secret-32-bytes-for-unit-tst";

describe("hmac", () => {
  it("signs a body and verifies it with same secret", () => {
    const body = '{"foo":"bar"}';
    const sig = signBody(body, SECRET);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects tampered body", () => {
    const body = '{"foo":"bar"}';
    const sig = signBody(body, SECRET);
    expect(verifySignature('{"foo":"baz"}', sig, SECRET)).toBe(false);
  });

  it("rejects tampered signature", () => {
    const body = '{"foo":"bar"}';
    expect(verifySignature(body, "0".repeat(64), SECRET)).toBe(false);
  });

  it("rejects signature of wrong length (timing safe guard)", () => {
    expect(verifySignature("x", "short", SECRET)).toBe(false);
  });
});
