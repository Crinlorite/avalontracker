"use client";
import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from "@xyflow/react";
import { edgeColorForHop, edgeWidthForPortal, edgeDashForHop } from "./graph-colors";
import { formatCountdown, secondsLeft } from "@/lib/time";
import type { HopView } from "@/hooks/useClanRoutes";

type RouteEdgeData = { hop: HopView; routeId: string };

export function RouteEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, data } = props;
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const dMaybe = data as unknown as RouteEdgeData | undefined;
  if (!dMaybe) return null;
  const d = dMaybe;
  const color = edgeColorForHop(d.hop);
  const width = edgeWidthForPortal(d.hop.portalSize);
  const dash = edgeDashForHop(d.hop);

  // Click en el label dispara un evento custom que ClanGraph escucha
  // a nivel del contenedor — más simple que pasar una callback por
  // todos los edges. Detail trae routeId + hopId para que el listener
  // resuelva la hop completa de los routes.
  function emitTimerClick(e: React.MouseEvent) {
    e.stopPropagation();
    const ev = new CustomEvent("avalon:edit-hop-time", {
      detail: { routeId: d.routeId, hopId: d.hop.id },
      bubbles: true,
    });
    (e.target as HTMLElement).dispatchEvent(ev);
  }

  return (
    <>
      <BaseEdge path={path} style={{ stroke: color, strokeWidth: width, strokeDasharray: dash }} />
      <EdgeLabelRenderer>
        <div
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          className="cursor-pointer rounded bg-slate-900/90 px-2 py-0.5 text-[10px] font-mono text-white border border-slate-700 hover:border-slate-500"
          onClick={emitTimerClick}
          title="Click para editar el tiempo a mano"
        >
          <span style={{ color }}>{formatCountdown(secondsLeft(d.hop.expiresAt))}</span>
          <span className="mx-1 text-slate-500">·</span>
          <span>{d.hop.portalSize}p</span>
          {d.hop.status === "COLLAPSED" && <span className="ml-1 text-slate-400">✕</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
