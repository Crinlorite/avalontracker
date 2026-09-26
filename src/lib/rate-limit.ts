import { LRUCache } from "lru-cache";

export type LimiterConfig = {
  windowMs: number;
  max: number;
};

export type Limiter = {
  cache: LRUCache<string, { count: number; resetAt: number }>;
  config: LimiterConfig;
};

export type ConsumeResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

export function createLimiter(config: LimiterConfig): Limiter {
  return {
    cache: new LRUCache({ max: 10_000, ttl: config.windowMs }),
    config,
  };
}

// ¿Está la clave agotada ahora mismo? No consume nada.
export function peekBlocked(limiter: Limiter, key: string): boolean {
  const entry = limiter.cache.get(key);
  return !!entry && entry.resetAt > Date.now() && entry.count >= limiter.config.max;
}

export function consumeToken(limiter: Limiter, key: string): ConsumeResult {
  const now = Date.now();
  const entry = limiter.cache.get(key);
  if (!entry || entry.resetAt <= now) {
    limiter.cache.set(key, { count: 1, resetAt: now + limiter.config.windowMs });
    return { ok: true, remaining: limiter.config.max - 1 };
  }
  if (entry.count >= limiter.config.max) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { ok: true, remaining: limiter.config.max - entry.count };
}
