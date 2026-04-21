"use client";
import { useMemo, useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ZoneNode } from "./ZoneNode";
import { RouteEdge } from "./RouteEdge";
import { computeLayout } from "./graph-layout";
import type { RouteView } from "@/hooks/useClanRoutes";

const nodeTypes = { zone: ZoneNode };
const edgeTypes = { route: RouteEdge };

export function ClanGraph({
  routes, anchorZoneName, onNodeClick,
}: { routes: RouteView[]; anchorZoneName: string | null; onNodeClick: (zoneName: string) => void }) {
  const computed = useMemo(() => computeLayout(routes, anchorZoneName), [routes, anchorZoneName]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(
      computed.nodes.map((n) => ({
        id: n.id,
        type: "zone",
        data: n,
        position: { x: n.x, y: n.y },
      }))
    );
    setEdges(
      computed.edges.map((e) => ({
        id: e.id,
        type: "route",
        source: e.source,
        target: e.target,
        data: { hop: e.hop, routeId: e.routeId },
      }))
    );
  }, [computed, setNodes, setEdges]);

  return (
    <div className="h-[calc(100vh-140px)] w-full rounded-xl border border-slate-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, n) => onNodeClick(n.id)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" />
        <Controls className="!border-slate-700 !bg-slate-900" />
        <MiniMap nodeColor="#4b5563" maskColor="rgba(15,23,42,0.8)" />
      </ReactFlow>
    </div>
  );
}
