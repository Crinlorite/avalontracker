import * as dagre from "@dagrejs/dagre";
import type { RouteView, HopView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";

export type LayoutNode = { id: string; zoneName: string; zoneType: string; tier: number | null; hasHideout: boolean; isRest: boolean; isCapital: boolean; x: number; y: number; isAnchor?: boolean };
export type LayoutEdge = { id: string; source: string; target: string; hop: HopView; routeId: string };

// Aproximación del tamaño renderizado de ZoneNode. dagre añade margen
// con nodesep/ranksep así que no es crítico afinar al pixel.
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

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

  // El anchor siempre es nodo, aunque no esté aún en ninguna ruta —
  // aparece como referencia visual desde donde el clan arrancará portales.
  if (anchor) {
    if (!nodes.has(anchor.name)) {
      nodes.set(anchor.name, {
        id: anchor.name, zoneName: anchor.name, zoneType: anchor.type, tier: anchor.tier,
        hasHideout: anchor.hasHideout, isRest: anchor.isRest, isCapital: anchor.isCapital,
        x: 0, y: 0, isAnchor: true,
      });
    } else {
      const existing = nodes.get(anchor.name)!;
      nodes.set(anchor.name, { ...existing, isAnchor: true });
    }
  }

  if (nodes.size === 0) return { nodes: [], edges };

  // Layout en árbol top-down con dagre.
  //   rankdir TB → anchor arriba, ramas bajando.
  //   nodesep   → separación horizontal entre nodos del mismo nivel.
  //   ranksep   → separación vertical entre niveles.
  //   acyclicer → rompe ciclos (rutas A→B→A de distintas creaciones)
  //               retirando aristas temporalmente; sin esto el layout
  //               es indefinido en multigrafos cíclicos.
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
    acyclicer: "greedy",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const name of nodes.keys()) {
    g.setNode(name, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  // dagre devuelve el centro del nodo; React Flow espera top-left.
  for (const [name, node] of nodes) {
    const pos = g.node(name);
    if (pos) {
      nodes.set(name, { ...node, x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
