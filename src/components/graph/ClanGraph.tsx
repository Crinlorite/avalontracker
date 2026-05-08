"use client";
import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge, useNodesState, useEdgesState } from "@xyflow/react";
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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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

  return (
    <div ref={containerRef} className="clan-graph h-[calc(100vh-220px)] w-full rounded-xl border border-slate-800">
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
        fitView
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
