"use client";
import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from "@xyflow/react";
import { edgeColorForHop, edgeWidthForPortal, edgeDashForHop } from "./graph-colors";
import { formatCountdown, secondsLeft } from "@/lib/time";
import type { HopView } from "@/hooks/useClanRoutes";

type RouteEdgeData = { hop: HopView; routeId: string; readOnly?: boolean };

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

  // Click derecho sobre el timer dispara un context menu específico
  // del temporizador (solo opciones de añadir tiempo, sin borrar). El
  // stopPropagation evita que ReactFlow trate este click derecho como
  // "click derecho sobre edge" (que sí mostraría también borrar).
  // preventDefault suprime el menu nativo del browser.
  function emitTimerContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ev = new CustomEvent("avalon:timer-context-menu", {
      detail: { routeId: d.routeId, hopId: d.hop.id, x: e.clientX, y: e.clientY },
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
          className={`${d.readOnly ? "" : "cursor-pointer hover:border-slate-500 "}rounded bg-slate-900/90 px-2 py-0.5 text-[10px] font-mono text-white border border-slate-700`}
          onClick={d.readOnly ? undefined : emitTimerClick}
          onContextMenu={d.readOnly ? undefined : emitTimerContextMenu}
          title={d.readOnly ? undefined : "Click: editar tiempo · Click derecho: añadir tiempos rápido"}
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
