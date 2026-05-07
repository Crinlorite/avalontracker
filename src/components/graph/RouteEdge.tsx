"use client";
import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from "@xyflow/react";
import { edgeColorForHop, edgeWidthForPortal, edgeDashForHop } from "./graph-colors";
import { formatCountdown, secondsLeft } from "@/lib/time";
import type { HopView } from "@/hooks/useClanRoutes";

type RouteEdgeData = { hop: HopView; routeId: string };

export function RouteEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, data } = props;
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const d = data as unknown as RouteEdgeData | undefined;
  if (!d) return null;
  const color = edgeColorForHop(d.hop);
  const width = edgeWidthForPortal(d.hop.portalSize);
  const dash = edgeDashForHop(d.hop);

  return (
    <>
      <BaseEdge path={path} style={{ stroke: color, strokeWidth: width, strokeDasharray: dash }} />
      <EdgeLabelRenderer>
        <div
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          className="rounded bg-slate-900/90 px-2 py-0.5 text-[10px] font-mono text-white border border-slate-700"
        >
          <span style={{ color }}>{formatCountdown(secondsLeft(d.hop.expiresAt))}</span>
          <span className="mx-1 text-slate-500">·</span>
          <span>{d.hop.portalSize}p</span>
          {d.hop.status === "COLLAPSED" && <span className="ml-1 text-slate-400">✕</span>}
          {d.hop.status === "WATCHED" && <span className="ml-1 text-yellow-300">👁</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
