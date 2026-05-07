import { useCallback, useEffect, useMemo, useRef } from "react";

type Position = { x: number; y: number };
type PositionMap = Record<string, Position>;

// Versionado: bump cuando el algoritmo de auto-layout cambia de forma
// no compatible. Las posiciones cacheadas por el usuario para nodos que
// ya estaban en la versión anterior se descartan (lo cual es correcto:
// el layout viejo produce posiciones que el nuevo layout no respeta).
// v2 (2026-05-07) — multi-tree TB unificado, todo hacia el sur, edges rectos.
const STORAGE_PREFIX = "avalon-tracker:layout:v2:";

function readCache(key: string): PositionMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as PositionMap;
    return {};
  } catch {
    return {};
  }
}

// Caché local (per-clan, per-user via localStorage del navegador) de
// posiciones de nodos en el grafo. Permite que las posiciones que el
// usuario arrastra a mano persistan entre recargas y entre refrescos
// del SWR polling.
//
// Las edges no se cachean — son aristas calculadas a partir de los
// nodos, no aportan estado del usuario.
export function useLayoutCache(clanId: string | undefined) {
  const key = clanId ? `${STORAGE_PREFIX}${clanId}` : null;

  // initialCache se calcula una vez por clanId. cacheRef lo refleja en
  // un ref para que get/set no provoquen re-renders.
  const initialCache = useMemo<PositionMap>(() => (key ? readCache(key) : {}), [key]);
  const cacheRef = useRef<PositionMap>(initialCache);

  // Si el clanId cambia (raro pero posible), re-hidrata.
  useEffect(() => {
    cacheRef.current = key ? readCache(key) : {};
  }, [key]);

  const get = useCallback((zoneName: string): Position | null => {
    return cacheRef.current[zoneName] ?? null;
  }, []);

  const set = useCallback(
    (zoneName: string, pos: Position) => {
      cacheRef.current = { ...cacheRef.current, [zoneName]: pos };
      if (!key || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(cacheRef.current));
      } catch {
        // localStorage lleno o no disponible — ignoramos. El cache en
        // memoria sigue funcionando hasta que se cierre la pestaña.
      }
    },
    [key],
  );

  return { get, set };
}
