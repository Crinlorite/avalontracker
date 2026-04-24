import type { RouteView, HopView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";

export type LayoutNode = { id: string; zoneName: string; zoneType: string; tier: number | null; hasHideout: boolean; isRest: boolean; isCapital: boolean; x: number; y: number; isAnchor?: boolean };
export type LayoutEdge = { id: string; source: string; target: string; hop: HopView; routeId: string };

export function computeLayout(
  routes: RouteView[],
  anchor: ClanAnchorZone | null,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const nodes = new Map<string, LayoutNode>();
  const edges: LayoutEdge[] = [];

  function ensureNode(name: string, z: HopView["fromZone"] | HopView["toZone"]) {
    if (nodes.has(name)) return;
    nodes.set(name, {
      id: name, zoneName: name, zoneType: z.type, tier: z.tier,
      hasHideout: z.hasHideout, isRest: z.isRest, isCapital: (z as { isCapital?: boolean }).isCapital ?? false,
      x: 0, y: 0,
    });
  }

  for (const r of routes) {
    for (const h of r.hops) {
      ensureNode(h.fromZone.name, h.fromZone);
      ensureNode(h.toZone.name, h.toZone);
      edges.push({ id: `${r.id}-${h.id}`, source: h.fromZone.name, target: h.toZone.name, hop: h, routeId: r.id });
    }
  }

  // Inyectar el anchor como nodo — aunque no esté aún en ninguna ruta, queremos
  // que aparezca como referencia visual desde donde el clan arrancará portales.
  if (anchor) {
    if (!nodes.has(anchor.name)) {
      nodes.set(anchor.name, {
        id: anchor.name,
        zoneName: anchor.name,
        zoneType: anchor.type,
        tier: anchor.tier,
        hasHideout: anchor.hasHideout,
        isRest: anchor.isRest,
        isCapital: anchor.isCapital,
        x: 0, y: 0,
        isAnchor: true,
      });
    } else {
      // Si el anchor ya es nodo (ruta activa pasa por él), marcarlo como anchor
      // para que el renderer le dé el realce visual.
      const existing = nodes.get(anchor.name)!;
      nodes.set(anchor.name, { ...existing, isAnchor: true });
    }
  }

  const list = Array.from(nodes.values());
  const center = anchor && nodes.has(anchor.name) ? nodes.get(anchor.name)! : list[0];
  if (!center) return { nodes: [], edges };

  // Layout radial básico: anchor al centro, resto en círculos concéntricos por distancia en edges.
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    adj.set(e.source, (adj.get(e.source) ?? new Set()).add(e.target));
    adj.set(e.target, (adj.get(e.target) ?? new Set()).add(e.source));
  }
  const distances = new Map<string, number>([[center.id, 0]]);
  const queue = [center.id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = distances.get(cur)!;
    for (const n of adj.get(cur) ?? []) {
      if (!distances.has(n)) { distances.set(n, d + 1); queue.push(n); }
    }
  }
  const byDist = new Map<number, string[]>();
  for (const [n, d] of distances) {
    if (!byDist.has(d)) byDist.set(d, []);
    byDist.get(d)!.push(n);
  }

  const RADIUS_STEP = 220;
  for (const [d, names] of byDist) {
    if (d === 0) {
      nodes.set(names[0], { ...nodes.get(names[0])!, x: 0, y: 0 });
      continue;
    }
    const count = names.length;
    names.forEach((name, i) => {
      const angle = (i / count) * Math.PI * 2;
      const r = d * RADIUS_STEP;
      nodes.set(name, { ...nodes.get(name)!, x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
  }

  // Nodes no alcanzables desde anchor: stack a la derecha.
  let fallbackY = 0;
  for (const n of list) {
    if (!distances.has(n.id)) {
      nodes.set(n.id, { ...nodes.get(n.id)!, x: 600, y: fallbackY });
      fallbackY += 120;
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
