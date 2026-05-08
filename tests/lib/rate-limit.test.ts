import { describe, it, expect, beforeEach } from "vitest";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    // nothing — cada createLimiter es independiente
  });

  it("allows requests under the limit", () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 3 });
    expect(consumeToken(limiter, "k1").ok).toBe(true);
    expect(consumeToken(limiter, "k1").ok).toBe(true);
    expect(consumeToken(limiter, "k1").ok).toBe(true);
  });

  it("blocks once over the limit and reports retryAfterMs", () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 2 });
    consumeToken(limiter, "k1");
    consumeToken(limiter, "k1");
    const blocked = consumeToken(limiter, "k1");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("tracks different keys independently", () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 1 });
    expect(consumeToken(limiter, "a").ok).toBe(true);
    expect(consumeToken(limiter, "b").ok).toBe(true);
    expect(consumeToken(limiter, "a").ok).toBe(false);
  });
});
