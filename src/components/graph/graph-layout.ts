import * as dagre from "@dagrejs/dagre";
import type { RouteView, HopView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";

export type LayoutNode = { id: string; zoneName: string; zoneType: string; tier: number | null; hasHideout: boolean; isRest: boolean; isCapital: boolean; x: number; y: number; isAnchor?: boolean };
export type LayoutEdge = { id: string; source: string; target: string; hop: HopView; routeId: string };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
// Geometría calculada para que un nodo con 2 hijos los reparta a ~45°
// SE/SW. Con node-center-to-child-center horizontal = (NODE_WIDTH +
// nodesep)/2 y vertical = NODE_HEIGHT + ranksep, igualar ambas da 45°:
//   (200 + nodesep)/2 = 80 + ranksep  →  nodesep = 2·ranksep − 40
// Con ranksep = 120 → nodesep = 200.
const NODESEP = 200;
const RANKSEP = 120;
// Hueco horizontal entre componentes independientes en la fila superior.
const COMPONENT_PADDING = 120;

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

  // El anchor siempre nodo, aunque ninguna ruta lo cruce todavía.
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

  // Adyacencia no dirigida del grafo completo.
  const adj = new Map<string, Set<string>>();
  for (const n of nodes.keys()) adj.set(n, new Set());
  for (const e of edges) {
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  // Componentes conexas. La del anchor (si existe) siempre la primera —
  // es el árbol "principal" que ocupará la columna izquierda.
  const visited = new Set<string>();
  const components: string[][] = [];
  const anchorId = anchor?.name;

  function bfsFrom(start: string): string[] {
    const comp: string[] = [];
    const q = [start];
    while (q.length) {
      const cur = q.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const m of adj.get(cur) ?? []) if (!visited.has(m)) q.push(m);
    }
    return comp;
  }

  if (anchorId && nodes.has(anchorId)) {
    components.push(bfsFrom(anchorId));
  }
  for (const n of nodes.keys()) {
    if (!visited.has(n)) components.push(bfsFrom(n));
  }

  // Layout por componente: dagre TB desde su root, todas las ramas hacia
  // abajo. Root = anchor si está en el componente, si no el primer nodo
  // sin entradas dentro del componente (= source natural de la cadena).
  type ComponentLayout = {
    localPositions: Map<string, { x: number; y: number }>;
    minX: number;
    maxX: number;
    minY: number;
  };

  function pickRoot(comp: string[], compSet: Set<string>): string {
    if (anchorId && compSet.has(anchorId)) return anchorId;
    const incoming = new Map<string, number>();
    for (const n of comp) incoming.set(n, 0);
    for (const e of edges) {
      if (compSet.has(e.source) && compSet.has(e.target)) {
        incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
      }
    }
    const sources = comp.filter((n) => (incoming.get(n) ?? 0) === 0);
    return sources[0] ?? comp[0];
  }

  const componentLayouts: ComponentLayout[] = components.map((comp) => {
    const compSet = new Set(comp);
    const root = pickRoot(comp, compSet);

    // BFS desde el root para obtener un spanning tree con aristas
    // root → hojas. Esto desacopla la dirección original de las hops:
    // dagre asigna rank por la spanning tree, no por las edges del data,
    // y el render usa las edges originales con su dirección real.
    const subAdj = new Map<string, Set<string>>();
    for (const n of comp) subAdj.set(n, new Set());
    for (const e of edges) {
      if (compSet.has(e.source) && compSet.has(e.target)) {
        subAdj.get(e.source)!.add(e.target);
        subAdj.get(e.target)!.add(e.source);
      }
    }
    const spanningEdges: { src: string; tgt: string }[] = [];
    const seen = new Set<string>([root]);
    const q = [root];
    while (q.length) {
      const cur = q.shift()!;
      for (const next of subAdj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          spanningEdges.push({ src: cur, tgt: next });
          q.push(next);
        }
      }
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: "TB",
      nodesep: NODESEP,
      ranksep: RANKSEP,
      marginx: 0,
      marginy: 0,
      acyclicer: "greedy",
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of comp) g.setNode(n, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const se of spanningEdges) g.setEdge(se.src, se.tgt);

    dagre.layout(g);

    // Snap pass: para cada nodo con UN solo hijo en el spanning tree,
    // forzar hijo.x = padre.x. dagre puede desviar levemente la X del
    // hijo cuando el árbol es asimétrico (un lado del padre tiene
    // descendencia más profunda que el otro), produciendo edges
    // single-child casi-verticales pero no del todo. Tras este snap
    // cualquier cadena lineal queda perfectamente recta hacia abajo.
    // Las bifurcaciones (parent con 2+ hijos) no se tocan: queremos
    // mantener la apertura natural a 45° SE/SW.
    const childrenOf = new Map<string, string[]>();
    for (const se of spanningEdges) {
      const list = childrenOf.get(se.src) ?? [];
      list.push(se.tgt);
      childrenOf.set(se.src, list);
    }
    const snapQueue = [root];
    while (snapQueue.length > 0) {
      const cur = snapQueue.shift()!;
      const kids = childrenOf.get(cur) ?? [];
      if (kids.length === 1) {
        const parentPos = g.node(cur);
        const childPos = g.node(kids[0]);
        if (parentPos && childPos) childPos.x = parentPos.x;
      }
      for (const k of kids) snapQueue.push(k);
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity;
    const localPositions = new Map<string, { x: number; y: number }>();
    for (const n of comp) {
      const p = g.node(n);
      if (!p) continue;
      localPositions.set(n, { x: p.x, y: p.y });
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
    }
    return { localPositions, minX, maxX, minY };
  });

  // Reparto horizontal de componentes en una "fila" superior. El primer
  // componente arranca en x=0; cada siguiente se coloca a la derecha del
  // anterior dejando COMPONENT_PADDING entre el borde derecho del
  // anterior y el borde izquierdo del actual. Los roots quedan todos al
  // mismo Y (el más alto de cada componente normalizado a 0).
  const finalPositions = new Map<string, { x: number; y: number }>();
  let xCursor = 0;
  for (const layout of componentLayouts) {
    const compWidth = layout.maxX - layout.minX + NODE_WIDTH;
    for (const [n, p] of layout.localPositions) {
      finalPositions.set(n, {
        x: p.x - layout.minX + xCursor,
        y: p.y - layout.minY,
      });
    }
    xCursor += compWidth + COMPONENT_PADDING;
  }

  // dagre devuelve centros, React Flow espera top-left.
  for (const [name, node] of nodes) {
    const p = finalPositions.get(name);
    if (p) nodes.set(name, { ...node, x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 });
  }

  return { nodes: Array.from(nodes.values()), edges };
}
