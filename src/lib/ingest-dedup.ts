import { LRUCache } from "lru-cache";

// Cache in-memory para detectar duplicados dentro de una ventana temporal.
// Cada endpoint de ingesta tiene la suya con su propia TTL.
// Keys los construye el endpoint a partir de (userId, zoneId, ...).
export type DedupCache = LRUCache<string, number>;

export function createDedupCache(ttlMs: number): DedupCache {
  return new LRUCache<string, number>({ max: 10_000, ttl: ttlMs });
}

export function seenRecently(cache: DedupCache, key: string): boolean {
  if (cache.has(key)) return true;
  cache.set(key, Date.now());
  return false;
}
