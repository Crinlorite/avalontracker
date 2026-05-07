"use client";
import { useMemo, useEffect, useCallback } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ZoneNode } from "./ZoneNode";
import { RouteEdge } from "./RouteEdge";
import { computeLayout } from "./graph-layout";
import { useLayoutCache } from "@/hooks/useLayoutCache";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";

const nodeTypes = { zone: ZoneNode };
const edgeTypes = { route: RouteEdge };

export function ClanGraph({
  clanId, routes, anchor, onNodeClick,
}: { clanId: string; routes: RouteView[]; anchor: ClanAnchorZone | null; onNodeClick: (zoneName: string) => void }) {
  const computed = useMemo(() => computeLayout(routes, anchor), [routes, anchor]);
  const { get: getCachedPosition, set: setCachedPosition } = useLayoutCache(clanId);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Sync incremental con el computed: mantiene posición de nodos
  // existentes (no aplasta drag del usuario ni la posición cacheada),
  // añade nuevos con su posición cacheada o, en su defecto, la del
  // auto-layout, y elimina los que ya no están en el grafo. Sin esto,
  // cada refresh del SWR (cada ~30s) reseteaba el layout.
  useEffect(() => {
    setNodes((current) => {
      const currentById = new Map(current.map((n) => [n.id, n]));
      return computed.nodes.map((c) => {
        const existing = currentById.get(c.id);
        if (existing) {
          return { ...existing, data: c };
        }
        const cached = getCachedPosition(c.id);
        return {
          id: c.id,
          type: "zone",
          data: c,
          position: cached ?? { x: c.x, y: c.y },
        };
      });
    });
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

  return (
    <div className="clan-graph h-[calc(100vh-220px)] w-full rounded-xl border border-slate-800">
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
    </div>
  );
}
