import type { RouteView, HopView } from "@/hooks/useClanRoutes";

// Una Route puede contener bifurcaciones internas: el usuario añadió
// dos hops desde un mismo zone (p.ej. desde el anchor) creando un árbol
// dentro de un único objeto Route. En el grafo se ve como árbol; en la
// lista, cada camino root → leaf debe aparecer como fila independiente
// para poder enviarlo al canal de Discord por separado.
//
// Esta función descompone una Route con bifurcaciones internas en N
// "path-routes": objetos con la misma metadata (id, createdBy, status)
// pero con un subset de hops que forman una cadena lineal sin
// bifurcaciones.
//
// Casos manejados:
//   - Route sin hops o con 1 hop → se devuelve tal cual (no hay nada
//     que descomponer).
//   - Route lineal (sin bifurcaciones) → se devuelve tal cual.
//   - Route con bifurcaciones → N path-routes (uno por hoja accesible
//     desde una root del árbol).
//   - Caso degenerado (ciclo, sin root claro) → se devuelve la Route
//     original como fallback para no perder visibilidad.
export function splitRouteIntoPaths(route: RouteView): RouteView[] {
  if (route.hops.length <= 1) return [route];

  // childrenByZone: zoneId del fromZone → hops que salen de él.
  const childrenByZone = new Map<number, HopView[]>();
  // incomingZones: zoneIds que aparecen como toZone de algún hop. Un
  // root del árbol es un zoneId que es fromZone de algo pero nunca
  // toZone — nadie le apunta dentro de la route.
  const incomingZones = new Set<number>();
  for (const h of route.hops) {
    const list = childrenByZone.get(h.fromZone.id) ?? [];
    list.push(h);
    childrenByZone.set(h.fromZone.id, list);
    incomingZones.add(h.toZone.id);
  }

  const rootZoneIds: number[] = [];
  for (const zoneId of childrenByZone.keys()) {
    if (!incomingZones.has(zoneId)) rootZoneIds.push(zoneId);
  }
  // Sin root claro = ciclo o estructura rara — devolvemos la route
  // original sin descomponer para que al menos sea visible.
  if (rootZoneIds.length === 0) return [route];

  const paths: HopView[][] = [];
  function dfs(zoneId: number, current: HopView[]) {
    const kids = childrenByZone.get(zoneId);
    if (!kids || kids.length === 0) {
      if (current.length > 0) paths.push([...current]);
      return;
    }
    for (const h of kids) dfs(h.toZone.id, [...current, h]);
  }
  for (const root of rootZoneIds) dfs(root, []);

  if (paths.length <= 1) return [route];

  // Cada path es un "path-route": misma metadata, hops filtrados. El
  // route.id se mantiene (compartido entre paths) — para keys de React
  // hay que usar una clave compuesta con los hop IDs del path.
  return paths.map((hops) => ({ ...route, hops }));
}

// React key estable y única para una path-route. Usa el route.id +
// los hop IDs ordenados, así dos paths del mismo route tienen keys
// distintas.
export function pathRouteKey(route: RouteView): string {
  return `${route.id}:${route.hops.map((h) => h.id).join(",")}`;
}
