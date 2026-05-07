import * as dagre from "@dagrejs/dagre";
import type { RouteView, HopView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";

export type LayoutNode = { id: string; zoneName: string; zoneType: string; tier: number | null; hasHideout: boolean; isRest: boolean; isCapital: boolean; x: number; y: number; isAnchor?: boolean };
export type LayoutEdge = { id: string; source: string; target: string; hop: HopView; routeId: string };

// Tamaño aproximado del nodo ZoneNode renderizado.
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
// Distancia centro-anchor → centro-branch-root.
const ANCHOR_GAP = 220;
// Separaciones dentro de cada sub-árbol. nodesep alto => hijos de un
// mismo padre se abren más → aristas a 45°+ en lugar de casi-verticales.
const SUBTREE_NODESEP = 150;
const SUBTREE_RANKSEP = 120;

// Direcciones cardinales alrededor del anchor. Orden importa: el primer
// sub-árbol cae abajo (dirección "natural"), el segundo arriba, luego
// derecha e izquierda. Cada rankdir hace que la raíz del sub-árbol
// quede en el lado más cercano al anchor y las hojas crezcan hacia
// fuera.
const DIRECTIONS: { rankdir: "TB" | "BT" | "LR" | "RL"; dx: number; dy: number }[] = [
  { rankdir: "TB", dx: 0, dy: 1 },
  { rankdir: "BT", dx: 0, dy: -1 },
  { rankdir: "LR", dx: 1, dy: 0 },
  { rankdir: "RL", dx: -1, dy: 0 },
];

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

  // El anchor siempre presente como nodo aunque no esté en ninguna ruta.
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

  // Sin anchor o solo el anchor solo: fallback a dagre TB plano.
  const anchorId = anchor?.name;
  if (!anchorId || !nodes.has(anchorId) || nodes.size === 1) {
    return runDagreTB(nodes, edges);
  }

  // Componentes conexas excluyendo el anchor — cada componente es un
  // "ramal" independiente que solo se conecta al resto vía anchor.
  const adj = new Map<string, Set<string>>();
  for (const n of nodes.keys()) adj.set(n, new Set());
  for (const e of edges) {
    if (e.source === anchorId || e.target === anchorId) continue;
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  const visited = new Set<string>([anchorId]);
  const components: Set<string>[] = [];
  for (const n of nodes.keys()) {
    if (visited.has(n)) continue;
    const comp = new Set<string>();
    const queue = [n];
    while (queue.length) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.add(cur);
      for (const m of adj.get(cur) ?? []) if (!visited.has(m)) queue.push(m);
    }
    if (comp.size > 0) components.push(comp);
  }

  // Más de 4 ramales: el modelo cardinal se queda corto, fallback a TB plano.
  if (components.length > 4) return runDagreTB(nodes, edges);

  if (components.length === 0) {
    // Solo el anchor (sin rutas).
    nodes.set(anchorId, { ...nodes.get(anchorId)!, x: -NODE_WIDTH / 2, y: -NODE_HEIGHT / 2 });
    return { nodes: Array.from(nodes.values()), edges };
  }

  // Para cada componente, branch root = nodo del componente conectado al anchor.
  const componentInfos = components.map((comp) => {
    let root: string | undefined;
    for (const e of edges) {
      if (e.source === anchorId && comp.has(e.target)) { root = e.target; break; }
      if (e.target === anchorId && comp.has(e.source)) { root = e.source; break; }
    }
    return { comp, root: root ?? Array.from(comp)[0] };
  });

  const positions = new Map<string, { x: number; y: number }>();
  positions.set(anchorId, { x: 0, y: 0 });

  componentInfos.forEach(({ comp, root }, i) => {
    const dir = DIRECTIONS[i];

    // BFS desde el branch root para construir un árbol con aristas
    // dirigidas root → leaves. Esto desacopla la dirección original de
    // las hops (Anchor→A o A→Anchor da igual): dagre asigna rangos
    // crecientes desde el root y el sub-árbol crece hacia afuera del
    // anchor independientemente de cómo se creó la ruta.
    const subAdj = new Map<string, Set<string>>();
    for (const n of comp) subAdj.set(n, new Set());
    for (const e of edges) {
      if (comp.has(e.source) && comp.has(e.target)) {
        subAdj.get(e.source)!.add(e.target);
        subAdj.get(e.target)!.add(e.source);
      }
    }
    const subTreeEdges: { src: string; tgt: string }[] = [];
    const seen = new Set<string>([root]);
    const q = [root];
    while (q.length) {
      const cur = q.shift()!;
      for (const next of subAdj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          subTreeEdges.push({ src: cur, tgt: next });
          q.push(next);
        }
      }
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: dir.rankdir,
      nodesep: SUBTREE_NODESEP,
      ranksep: SUBTREE_RANKSEP,
      marginx: 0,
      marginy: 0,
      acyclicer: "greedy",
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of comp) g.setNode(n, { width: NODE_WIDTH, height: NODE_HEIGHT });
    for (const se of subTreeEdges) g.setEdge(se.src, se.tgt);

    dagre.layout(g);

    const rootPos = g.node(root);
    if (!rootPos) return;

    // Trasladar el sub-árbol para que el branch root quede en
    // (dx*GAP, dy*GAP) respecto al anchor (origen).
    const targetX = dir.dx * ANCHOR_GAP;
    const targetY = dir.dy * ANCHOR_GAP;
    const offX = targetX - rootPos.x;
    const offY = targetY - rootPos.y;

    for (const n of comp) {
      const p = g.node(n);
      if (p) positions.set(n, { x: p.x + offX, y: p.y + offY });
    }
  });

  // dagre da centros, React Flow espera top-left.
  for (const [name, node] of nodes) {
    const p = positions.get(name);
    if (p) nodes.set(name, { ...node, x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 });
  }

  return { nodes: Array.from(nodes.values()), edges };
}

// Fallback: dagre TB plano sobre todo el grafo. Se usa cuando no hay
// anchor o cuando hay tantos ramales (>4) que el reparto cardinal
// pierde sentido.
function runDagreTB(
  nodes: Map<string, LayoutNode>,
  edges: LayoutEdge[],
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: SUBTREE_NODESEP,
    ranksep: SUBTREE_RANKSEP,
    marginx: 40,
    marginy: 40,
    acyclicer: "greedy",
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes.keys()) g.setNode(n, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  for (const [name, node] of nodes) {
    const pos = g.node(name);
    if (pos) nodes.set(name, { ...node, x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  }
  return { nodes: Array.from(nodes.values()), edges };
}
