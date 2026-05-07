import { useCallback, useEffect, useMemo, useRef } from "react";

type Position = { x: number; y: number };
type PositionMap = Record<string, Position>;
type CachedData = { topology: string; positions: PositionMap };

// Versionado: bump cuando el algoritmo de auto-layout cambia de forma
// no compatible. Las posiciones cacheadas por el usuario para nodos que
// ya estaban en la versión anterior se descartan.
// v2 (2026-05-07) — multi-tree TB unificado, todo hacia el sur, edges rectos.
const STORAGE_PREFIX = "avalon-tracker:layout:v2:";

function readCache(key: string, currentTopology: string): PositionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<CachedData> | unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "topology" in parsed &&
      "positions" in parsed &&
      (parsed as CachedData).topology === currentTopology &&
      typeof (parsed as CachedData).positions === "object"
    ) {
      return (parsed as CachedData).positions;
    }
    // topology cambiada (o formato viejo) → drop cache
    return {};
  } catch {
    return {};
  }
}

// Caché local de posiciones de nodos en el grafo, vinculada a la
// topología actual del grafo. Si la topología cambia (el usuario añade
// o quita un hop), las posiciones cacheadas se descartan
// automáticamente — porque dejan de ser válidas: un nodo podría haber
// quedado donde ahora cae el hijo nuevo, generando colisiones, o el
// auto-layout habría reposicionado todos los hermanos a ángulos
// distintos. Mejor reset limpio que mezcla incoherente.
//
// Las edges no se cachean — son aristas calculadas a partir de los
// nodos, no aportan estado del usuario.
export function useLayoutCache(clanId: string | undefined, topology: string) {
  const key = clanId ? `${STORAGE_PREFIX}${clanId}` : null;

  // initialCache se recalcula si cambia clanId o topology.
  const initialCache = useMemo<PositionMap>(
    () => (key ? readCache(key, topology) : {}),
    [key, topology],
  );
  const cacheRef = useRef<PositionMap>(initialCache);

  // Re-hidrata cuando topology o clanId cambian. La invalidación por
  // topology cambiada es lo que asegura que añadir un hop reflowe el
  // árbol entero en lugar de mantener X antiguas que colisionarían.
  useEffect(() => {
    cacheRef.current = key ? readCache(key, topology) : {};
  }, [key, topology]);

  const get = useCallback((zoneName: string): Position | null => {
    return cacheRef.current[zoneName] ?? null;
  }, []);

  const set = useCallback(
    (zoneName: string, pos: Position) => {
      cacheRef.current = { ...cacheRef.current, [zoneName]: pos };
      if (!key || typeof window === "undefined") return;
      try {
        const data: CachedData = { topology, positions: cacheRef.current };
        window.localStorage.setItem(key, JSON.stringify(data));
      } catch {
        // localStorage lleno o no disponible — ignoramos. El cache en
        // memoria sigue funcionando hasta que se cierre la pestaña.
      }
    },
    [key, topology],
  );

  return { get, set };
}
