import meta from "@/data/world-meta.json";

// Tipos de PvP en Albion según `world-meta.json` (extraído del dump
// público de cluster.bin). Define el color del borde que el zone-card
// y el grafo aplican a cada zona.
export type PvpType = "blue" | "yellow" | "red" | "black" | "green" | "special" | "mixed";

const PVP_BY_NAME = meta.pvp as Record<string, PvpType>;
const ADJACENCY_BY_NAME = meta.adjacency as Record<string, string[]>;

// Las 5 ciudades royal de Albion (zona "main"). Brecilien queda fuera
// — aunque es ciudad, está en las Mists y no es referencia útil para
// "estoy a X hops de una royal city".
const ROYAL_CITIES = new Set<string>([
  "Lymhurst",
  "Martlock",
  "Thetford",
  "Bridgewatch",
  "Fort Sterling",
]);

// Los 5 portales de las ciudades royal en las Outlands (alrededor de
// Caerleon). Para zonas negras, indicar el portal más cercano da una
// orientación geográfica útil ("estás cerca de Martlock Portal" → sale
// por Martlock al volver).
const ROYAL_PORTALS = new Set<string>([
  "Lymhurst Portal",
  "Martlock Portal",
  "Thetford Portal",
  "Bridgewatch Portal",
  "Fort Sterling Portal",
]);

export function getZonePvp(name: string): PvpType | null {
  return PVP_BY_NAME[name] ?? null;
}

// Color del borde del zone-card según pvp. Usamos los colores
// canónicos de Albion para que los miembros del clan los identifiquen
// inmediatamente. "special" (Mists, Lighthouse, etc) en violeta
// místico — sin equivalente directo en el juego pero el más usado en
// fan-content. "mixed" en naranja para tunnels.
export function borderColorForPvp(pvp: PvpType | null): string {
  switch (pvp) {
    case "blue": return "#3b82f6";    // royal blue (cities, T2 starting)
    case "yellow": return "#eab308";  // T5 yellow PvP
    case "red": return "#ef4444";     // T6 red PvP
    case "black": return "#52525b";   // outlands black (gris oscuro místico)
    case "green": return "#22c55e";   // safe areas
    case "special": return "#a855f7"; // Mists, Lighthouse, Avalon — místico
    case "mixed": return "#f97316";   // tunnels
    default: return "#64748b";        // desconocido — slate
  }
}

// BFS en el grafo de adyacencia hasta encontrar un nodo que cumpla
// `predicate`. Devuelve { name, hops } o null si no se alcanza dentro
// del límite de profundidad. Cachea resultados por (zoneName +
// predicateKey) en la sesión del módulo para no recalcular en cada
// render.
const proximityCache = new Map<string, { name: string; hops: number } | null>();

function bfsNearest(
  start: string,
  isTarget: (name: string) => boolean,
  cacheKey: string,
  maxDepth = 12,
): { name: string; hops: number } | null {
  const ck = `${cacheKey}|${start}`;
  if (proximityCache.has(ck)) return proximityCache.get(ck)!;

  if (!ADJACENCY_BY_NAME[start]) {
    proximityCache.set(ck, null);
    return null;
  }

  // Si el propio start es target, hops=0.
  if (isTarget(start)) {
    const r = { name: start, hops: 0 };
    proximityCache.set(ck, r);
    return r;
  }

  const visited = new Set<string>([start]);
  const queue: { name: string; hops: number }[] = [{ name: start, hops: 0 }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.hops >= maxDepth) break;
    const neighbors = ADJACENCY_BY_NAME[cur.name] ?? [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      if (isTarget(n)) {
        const r = { name: n, hops: cur.hops + 1 };
        proximityCache.set(ck, r);
        return r;
      }
      queue.push({ name: n, hops: cur.hops + 1 });
    }
  }
  proximityCache.set(ck, null);
  return null;
}

export function nearestRoyalCity(zoneName: string): { name: string; hops: number } | null {
  return bfsNearest(zoneName, (n) => ROYAL_CITIES.has(n), "royal");
}

export function nearestRoyalPortal(zoneName: string): { name: string; hops: number } | null {
  return bfsNearest(zoneName, (n) => ROYAL_PORTALS.has(n), "portal");
}

// BFS que devuelve los N portales más cercanos. Útil para dar opciones
// al usuario en lugar de un único "el más corto" — si el más corto es
// un portal saturado, el segundo le sirve.
const portalsNearestCache = new Map<string, { name: string; hops: number }[]>();

function nearestNRoyalPortals(zoneName: string, n: number, maxDepth = 12): { name: string; hops: number }[] {
  const ck = `${zoneName}|n${n}`;
  if (portalsNearestCache.has(ck)) return portalsNearestCache.get(ck)!;
  if (!ADJACENCY_BY_NAME[zoneName]) {
    portalsNearestCache.set(ck, []);
    return [];
  }

  const found: { name: string; hops: number }[] = [];
  const visited = new Set<string>([zoneName]);
  const queue: { name: string; hops: number }[] = [{ name: zoneName, hops: 0 }];
  while (queue.length > 0 && found.length < n) {
    const cur = queue.shift()!;
    if (cur.hops >= maxDepth) continue;
    const neighbors = ADJACENCY_BY_NAME[cur.name] ?? [];
    for (const neigh of neighbors) {
      if (visited.has(neigh)) continue;
      visited.add(neigh);
      const hops = cur.hops + 1;
      if (ROYAL_PORTALS.has(neigh)) {
        found.push({ name: neigh, hops });
        if (found.length >= n) break;
      }
      queue.push({ name: neigh, hops });
    }
  }
  portalsNearestCache.set(ck, found);
  return found;
}

export function nearestRoyalPortals(zoneName: string, n = 2): { name: string; hops: number }[] {
  return nearestNRoyalPortals(zoneName, n);
}

// Pista de proximidad para mostrar en zone-card (grafo) y share-card.
// Devuelve UN ARRAY de líneas (no string concatenado) para que cada
// destino se renderice en su propia fila — caben sin truncarse.
//
// Nombres completos preservados: "Fort Sterling Portal" no se acorta
// (en Albion son zonas distintas a "Fort Sterling" → ciudad royal).
//
// Política:
// - Si la zona ES una royal city principal → null (ya estás ahí)
// - Black → 2 portales más cercanos (líneas separadas)
// - Cualquier otra zona (yellow/red/green/special/mixed/etc) → la
//   royal city más cercana en hops. Útil para zonas tipo Sandgust
//   Cleft (green safe area) o Mists especiales — saber a cuántos
//   hops queda la ciudad de respaldo siempre informa.
export function proximityHintsForZone(name: string): string[] | null {
  const pvp = getZonePvp(name);
  if (!pvp) return null;
  if (ROYAL_CITIES.has(name)) return null;

  if (pvp === "black") {
    const portals = nearestRoyalPortals(name, 2);
    if (portals.length > 0) {
      return portals.map((p) => `${p.hops}h ${p.name}`);
    }
    // Fallback a royal city si no hay portales alcanzables.
    const c = nearestRoyalCity(name);
    if (c && c.hops > 0) return [`${c.hops}h → ${c.name}`];
    return null;
  }

  // Resto: nearest royal city (incluye green safearea como Sandgust
  // Cleft, yellow/red de roads, special de Mists, mixed de tunnels).
  const c = nearestRoyalCity(name);
  if (c && c.hops > 0) return [`${c.hops}h → ${c.name}`];
  return null;
}

// Wrapper retro-compat (string concatenado) — solo si algún caller
// suelto lo necesita. Preferimos proximityHintsForZone que devuelve
// líneas separadas.
export function proximityHintForZone(name: string): string | null {
  const lines = proximityHintsForZone(name);
  if (!lines || lines.length === 0) return null;
  return lines.join(" · ");
}
