"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

interface Hop {
  fromZone: string;
  toZone: string;
  portalSize: number;
  expiresAt: string;
  status: string;
}

interface Route {
  id: string;
  status: string;
  createdAt: string;
  hops: Hop[];
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: "AVALON" | "ROYAL" | "OUTLANDS";
}

interface GraphEdge {
  source: string;
  target: string;
  portalSize: number;
  expiresAt: string;
  status: string;
  routeId: string;
}

export default function MapPage() {
  const { clanId } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Map<string, GraphNode>>(new Map());
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [chainMode, setChainMode] = useState(false);
  const [chainSource, setChainSource] = useState<string | null>(null);
  const animRef = useRef<number>(0);
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);

  // Fetch routes
  useEffect(() => {
    async function loadRoutes() {
      const res = await fetch(`/api/clans/${clanId}/routes?status=ACTIVE`);
      if (res.ok) {
        const data: Route[] = await res.json();
        setRoutes(data);
        buildGraph(data);
      }
    }
    loadRoutes();
  }, [clanId]);

  function getZoneType(name: string): "AVALON" | "ROYAL" | "OUTLANDS" {
    if (name.startsWith("TNL-") || name.includes("Avalon") || /^[A-Z][a-z]+-[A-Z]/.test(name)) return "AVALON";
    if (name.startsWith("BLACKBANK") || name.includes("Outlands")) return "OUTLANDS";
    return "ROYAL";
  }

  function buildGraph(routeData: Route[]) {
    const nodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];

    for (const route of routeData) {
      for (const hop of route.hops) {
        if (!nodeMap.has(hop.fromZone)) {
          nodeMap.set(hop.fromZone, {
            id: hop.fromZone,
            x: 300 + Math.random() * 400,
            y: 200 + Math.random() * 300,
            vx: 0,
            vy: 0,
            type: getZoneType(hop.fromZone),
          });
        }
        if (!nodeMap.has(hop.toZone)) {
          nodeMap.set(hop.toZone, {
            id: hop.toZone,
            x: 300 + Math.random() * 400,
            y: 200 + Math.random() * 300,
            vx: 0,
            vy: 0,
            type: getZoneType(hop.toZone),
          });
        }
        edgeList.push({
          source: hop.fromZone,
          target: hop.toZone,
          portalSize: hop.portalSize,
          expiresAt: hop.expiresAt,
          status: hop.status,
          routeId: route.id,
        });
      }
    }

    setNodes(nodeMap);
    setEdges(edgeList);
  }

  // Chain routes
  async function chainRoutes(fromRouteEnd: string, toRouteStart: string) {
    // Find routes that end with fromRouteEnd and start with toRouteStart
    // This is visual only — user confirms by creating a combined route
    alert(`Encadenar: ${fromRouteEnd} → ${toRouteStart}\nEsta funcion creara una ruta combinada.`);
    setChainMode(false);
    setChainSource(null);
  }

  // Force simulation
  useEffect(() => {
    if (nodes.size === 0) return;

    function simulate() {
      const nodeArr = Array.from(nodes.values());
      const damping = 0.9;
      const repulsion = 5000;
      const attraction = 0.01;
      const centerX = 500;
      const centerY = 350;

      // Repulsion between nodes
      for (let i = 0; i < nodeArr.length; i++) {
        for (let j = i + 1; j < nodeArr.length; j++) {
          const dx = nodeArr[i].x - nodeArr[j].x;
          const dy = nodeArr[i].y - nodeArr[j].y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodeArr[i].vx += fx;
          nodeArr[i].vy += fy;
          nodeArr[j].vx -= fx;
          nodeArr[j].vy -= fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const src = nodes.get(edge.source);
        const tgt = nodes.get(edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = dist * attraction;
        src.vx += (dx / dist) * force;
        src.vy += (dy / dist) * force;
        tgt.vx -= (dx / dist) * force;
        tgt.vy -= (dy / dist) * force;
      }

      // Center gravity
      for (const node of nodeArr) {
        node.vx += (centerX - node.x) * 0.001;
        node.vy += (centerY - node.y) * 0.001;
      }

      // Apply velocity
      for (const node of nodeArr) {
        if (dragRef.current?.nodeId === node.id) continue;
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(30, Math.min(970, node.x));
        node.y = Math.max(30, Math.min(670, node.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    }

    animRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    for (const edge of edges) {
      const src = nodes.get(edge.source);
      const tgt = nodes.get(edge.target);
      if (!src || !tgt) continue;

      ctx.strokeStyle = edge.portalSize >= 20 ? "rgba(59, 130, 246, 0.6)" : "rgba(107, 114, 128, 0.4)";
      ctx.lineWidth = edge.portalSize >= 20 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();

      // Portal size label
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(156, 163, 175, 0.7)";
      ctx.fillText(String(edge.portalSize), mx + 3, my - 3);
    }

    // Draw nodes
    for (const node of nodes.values()) {
      const colors = {
        AVALON: { fill: "#7c3aed", stroke: "#a78bfa", text: "#e9d5ff" },
        ROYAL: { fill: "#2563eb", stroke: "#60a5fa", text: "#bfdbfe" },
        OUTLANDS: { fill: "#dc2626", stroke: "#f87171", text: "#fecaca" },
      };
      const c = colors[node.type];
      const isSelected = node.id === selectedNode;
      const radius = isSelected ? 10 : 7;

      ctx.shadowColor = c.stroke;
      ctx.shadowBlur = isSelected ? 12 : 4;
      ctx.fillStyle = c.fill;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isSelected) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      ctx.font = "11px sans-serif";
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.fillText(node.id, node.x, node.y - radius - 4);
      ctx.textAlign = "left";
    }

    // Chain mode indicator
    if (chainMode) {
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("MODO ENCADENAR: click en nodo origen, luego destino", 10, 20);
    }
  }

  // Mouse handlers
  function handleMouseDown(e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const node of nodes.values()) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy < 150) {
        if (chainMode) {
          if (!chainSource) {
            setChainSource(node.id);
          } else {
            chainRoutes(chainSource, node.id);
          }
          return;
        }
        setSelectedNode(node.id);
        dragRef.current = { nodeId: node.id, offsetX: dx, offsetY: dy };
        return;
      }
    }
    setSelectedNode(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = nodes.get(dragRef.current.nodeId);
    if (!node) return;
    node.x = e.clientX - rect.left - dragRef.current.offsetX;
    node.y = e.clientY - rect.top - dragRef.current.offsetY;
  }

  function handleMouseUp() {
    dragRef.current = null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Mapa de Roads</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setChainMode(!chainMode); setChainSource(null); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              chainMode ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {chainMode ? "Cancelar encadenar" : "Encadenar rutas"}
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-violet-600"></span> Avalon</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-blue-600"></span> Royal</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-red-600"></span> Outlands</span>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 p-2">
        <canvas
          ref={canvasRef}
          width={1000}
          height={700}
          className="w-full cursor-grab rounded"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {selectedNode && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-lg font-bold text-white">{selectedNode}</h3>
          <p className="text-sm text-gray-400">
            Tipo: {nodes.get(selectedNode)?.type} |
            Conexiones: {edges.filter(e => e.source === selectedNode || e.target === selectedNode).length}
          </p>
          <div className="mt-2 space-y-1">
            {edges
              .filter(e => e.source === selectedNode || e.target === selectedNode)
              .map((e, i) => (
                <div key={i} className="text-xs text-gray-500">
                  → {e.source === selectedNode ? e.target : e.source} (portal {e.portalSize})
                </div>
              ))}
          </div>
        </div>
      )}

      {nodes.size === 0 && (
        <div className="py-20 text-center text-gray-600">
          <p className="text-lg">No hay rutas activas</p>
          <p className="text-sm">Crea rutas en la pestaña Rutas para verlas aqui</p>
        </div>
      )}
    </div>
  );
}
