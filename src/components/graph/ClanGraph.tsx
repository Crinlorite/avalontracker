"use client";
import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge, type ReactFlowInstance, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ZoneNode } from "./ZoneNode";
import { RouteEdge } from "./RouteEdge";
import { computeLayout } from "./graph-layout";
import { useLayoutCache } from "@/hooks/useLayoutCache";
import { EditHopTimeModal } from "@/components/routes/EditHopTimeModal";
import type { RouteView, HopView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";

const nodeTypes = { zone: ZoneNode };
const edgeTypes = { route: RouteEdge };

export function ClanGraph({
  clanId, routes, anchor, anchorSecurityLevel, onNodeClick,
}: {
  clanId: string;
  routes: RouteView[];
  anchor: ClanAnchorZone | null;
  anchorSecurityLevel?: "SAFE" | "CAUTION" | "DANGER" | null;
  onNodeClick: (zoneName: string) => void;
}) {
  const computed = useMemo(
    () => computeLayout(routes, anchor, anchorSecurityLevel ?? null),
    [routes, anchor, anchorSecurityLevel],
  );
  // Hash de topología: conjunto ordenado de aristas. Si la topología
  // cambia (se añade o quita un hop), el hash cambia y la caché de
  // posiciones se invalida automáticamente — los drags antiguos
  // dejaban X huérfanas que colisionaban con la nueva geometría.
  const topologyHash = useMemo(
    () => computed.edges.map((e) => `${e.source}|${e.target}`).sort().join(";"),
    [computed.edges],
  );
  const { get: getCachedPosition, set: setCachedPosition } = useLayoutCache(clanId, topologyHash);

  // Computa los nodos/edges iniciales con los datos ya disponibles —
  // clave para que ReactFlow monte CON nodos y `fitView` los pueda
  // encuadrar de salida. Antes useNodesState se inicializaba con []
  // y los nodos llegaban en un useEffect posterior, momento en que
  // fitView ya había corrido en vacío y el viewport quedaba en (0,0).
  // Resultado visible: grafo aparentemente vacío hasta que el usuario
  // panea/zoomea manualmente. Edits y refresh SWR siguen funcionando
  // porque el useEffect de sync de abajo sobreescribe la state cuando
  // `computed` cambia.
  const initialNodes = useMemo<Node[]>(
    () =>
      computed.nodes.map((c) => {
        const cached = getCachedPosition(c.id);
        return {
          id: c.id,
          type: "zone",
          data: c,
          position: cached ?? { x: c.x, y: c.y },
        };
      }),
    // Dependencia vacía: solo se computa al mount. Updates posteriores
    // van por el useEffect (setNodes) — no reinicializan este memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo<Edge[]>(
    () =>
      computed.edges.map((e) => ({
        id: e.id,
        type: "route",
        source: e.source,
        target: e.target,
        data: { hop: e.hop, routeId: e.routeId },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  // Sync con el computed: la presencia en localStorage es la única señal
  // de "fijo por el usuario" — si arrastró el nodo, respetamos su
  // posición; si no, aplicamos el auto-layout SIEMPRE (no solo en la
  // creación del nodo). Sin esto, cuando se añade un hermano nuevo a
  // un nodo con bifurcación de 2 hijos para convertirla en una de 3,
  // los dos hermanos viejos se quedaban en sus X "de bifurcación-2" y
  // el nuevo se solapaba encima en vez de reflowarse el trío con
  // ángulos nuevos.
  // Como dagre es determinista, re-aplicar layout cada SWR refresh no
  // produce flicker para topologías que no cambian.
  useEffect(() => {
    setNodes(
      computed.nodes.map((c) => {
        const cached = getCachedPosition(c.id);
        return {
          id: c.id,
          type: "zone",
          data: c,
          position: cached ?? { x: c.x, y: c.y },
        };
      }),
    );
    setEdges(
      computed.edges.map((e) => ({
        id: e.id,
        type: "route",
        source: e.source,
        target: e.target,
        data: { hop: e.hop, routeId: e.routeId },
      })),
    );
  }, [computed, setNodes, setEdges, getCachedPosition]);

  // Persiste la posición cuando el usuario suelta un nodo arrastrado.
  // Así sobrevive a refreshes y a recargas completas del navegador.
  const handleNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      setCachedPosition(node.id, node.position);
    },
    [setCachedPosition],
  );

  // Editor de tiempo a mano: el RouteEdge dispara un CustomEvent
  // "avalon:edit-hop-time" (con detail={routeId, hopId}) cuando el
  // usuario clickea el label del timer. Resolvemos la HopView con los
  // datos actuales y abrimos el modal.
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingHop, setEditingHop] = useState<{ hop: HopView; routeId: string } | null>(null);

  // Guarda la instancia de ReactFlow tras mount para poder llamar
  // `fitView` cuando los nodos lleguen tarde (caso típico: routes
  // cargan antes que clan, ClanGraph monta sin anchor → 0 nodos →
  // fitView no-op → cuando clan carga, los nodos aparecen pero ya
  // nadie los encuadra).
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // Mobile + grafos densos: en lugar de meter todos los nodos en
  // viewport (zoom-out hasta hacerlos ilegibles), enfocamos solo
  // el anchor con padding generoso. El usuario hace pinch para
  // explorar el resto. Si no hay anchor o son pocos nodos, el
  // fitView normal con maxZoom 0.85 ya da buen resultado.
  const fitOptions = useMemo(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const manyNodes = computed.nodes.length > 8;
    const anchorRfNode = computed.nodes.find((n) => n.isAnchor);
    if (isMobile && manyNodes && anchorRfNode) {
      return { nodes: [{ id: anchorRfNode.id }], padding: 0.6, maxZoom: 1.1 };
    }
    return { maxZoom: 0.85, padding: 0.15 };
  }, [computed.nodes]);
  // Re-fit cuando los nodos pasan de 0 a >0 (clan/anchor llegando
  // después que routes). También cuando el número cambia
  // significativamente — añadir o quitar hops puede dejar nodos
  // fuera del viewport actual.
  const prevNodeCountRef = useRef(0);
  useEffect(() => {
    const rf = rfRef.current;
    const count = nodes.length;
    if (rf && count > 0 && prevNodeCountRef.current === 0) {
      // Subimos de 0 a >0 — fit con doble disparo (ver onInit).
      rf.fitView(fitOptions);
      requestAnimationFrame(() => rf.fitView(fitOptions));
    }
    prevNodeCountRef.current = count;
  }, [nodes.length, fitOptions]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    function handler(ev: Event) {
      const detail = (ev as CustomEvent<{ routeId: string; hopId: number }>).detail;
      if (!detail) return;
      const route = routes.find((r) => r.id === detail.routeId);
      const hop = route?.hops.find((h) => h.id === detail.hopId);
      if (route && hop) setEditingHop({ hop, routeId: route.id });
    }
    node.addEventListener("avalon:edit-hop-time", handler);
    return () => node.removeEventListener("avalon:edit-hop-time", handler);
  }, [routes]);

  // Empty-state visible: si no hay nodos, mostramos un mensaje
  // explícito en lugar de un cajón negro. El cajón negro es el
  // peor de los mundos — el usuario no sabe si hay un bug, si la
  // ruta no tiene hops vivos, o si Vigil/clan está cargando.
  const hasNodes = nodes.length > 0;

  return (
    <div ref={containerRef} className="clan-graph relative w-full min-h-[350px] flex-1 rounded-xl border border-slate-800">
      {/*
        ClanGraph ahora es flex-1 directamente (no h-full): el padre
        es el flex-col del page wrapper y aquí crecemos para llenar
        el espacio sobrante tras header + anchor card. min-h-[350px]
        actúa como suelo. Antes el outer div usaba h-full que
        necesita parent con altura explícita y fallaba en algunas
        cadenas flex (especialmente Safari + ciertos overflow).
      */}
      {!hasNodes && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-slate-500">
          <div className="max-w-sm space-y-2 px-6">
            <p className="text-2xl">🗺️</p>
            <p className="font-semibold text-slate-400">El grafo está vacío</p>
            <p className="leading-relaxed">
              Sin rutas activas y sin anchor configurado, no hay nodos
              que pintar. Configura el anchor del clan en Settings o
              crea una ruta nueva con el botón de arriba.
            </p>
          </div>
        </div>
      )}
      <style jsx global>{`
        .clan-graph .react-flow__controls {
          background: rgb(15, 23, 42);
          border: 1px solid rgb(51, 65, 85);
          border-radius: 0.5rem;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .clan-graph .react-flow__controls-button {
          background: rgb(15, 23, 42);
          border-bottom: 1px solid rgb(51, 65, 85);
          color: rgb(226, 232, 240);
          fill: rgb(226, 232, 240);
        }
        .clan-graph .react-flow__controls-button:hover {
          background: rgb(30, 41, 59);
        }
        .clan-graph .react-flow__controls-button:last-child {
          border-bottom: none;
        }
        .clan-graph .react-flow__attribution {
          background: transparent;
          color: rgb(100, 116, 139);
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, n) => onNodeClick(n.id)}
        onInit={(rf: ReactFlowInstance) => {
          // Guardamos instancia para que el useEffect de "nodos llegan
          // tarde" pueda llamar fitView cuando lleguen. fitView aquí
          // mismo cubre el caso normal (nodos disponibles al mount).
          rfRef.current = rf;
          rf.fitView(fitOptions);
          requestAnimationFrame(() => rf.fitView(fitOptions));
        }}
        fitView
        fitViewOptions={fitOptions}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {editingHop && (
        <EditHopTimeModal
          clanId={clanId}
          routeId={editingHop.routeId}
          hop={editingHop.hop}
          onClose={() => setEditingHop(null)}
        />
      )}
    </div>
  );
}
