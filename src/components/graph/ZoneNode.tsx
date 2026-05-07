"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeBorderColorForZone } from "./graph-colors";
import type { LayoutNode } from "./graph-layout";

export function ZoneNode({ data, selected }: NodeProps) {
  const d = data as unknown as LayoutNode;
  // Color del borde basado en el PvP real de la zona (azul, amarillo,
  // rojo, negro, especial...) extraído del dump del juego. Cae al
  // tipo del modelo si la zona no está en el dump.
  const color = nodeBorderColorForZone(d.zoneName, d.zoneType);
  // El anchor del clan se resalta con borde dorado más grueso y glow suave
  // para que quede claro desde qué nodo arranca la guarida del clan.
  const anchorGlow = d.isAnchor ? "shadow-[0_0_20px_rgba(250,204,21,0.35)]" : "";
  const borderColor = selected ? "#facc15" : d.isAnchor ? "#fbbf24" : color;
  const borderWidth = d.isAnchor ? "border-[3px]" : "border-2";
  return (
    <div
      // Ancho fijo 200px = NODE_WIDTH del graph-layout. Sin esto, nodos
      // con texto largo (p.ej. IDs de Mists "@MISTS@<uuid>") se
      // renderizan más anchos que lo que dagre asume, sus handles caen
      // desplazados del eje de la cadena, y los edges single-child
      // salen diagonales en vez de verticales.
      className={`rounded-lg ${borderWidth} bg-slate-900 px-3 py-2 shadow ${anchorGlow}`}
      style={{ borderColor, width: 200 }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5 min-w-0">
        {d.isAnchor && <span className="text-xs flex-shrink-0" title="Anchor del clan">⚓</span>}
        <div className="font-semibold text-white truncate" title={d.zoneName}>{d.zoneName}</div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {d.tier != null && <span className="rounded bg-slate-700 px-1 py-0.5 text-[10px] text-white">T{d.tier}</span>}
        {d.hasHideout && <span className="rounded bg-yellow-700 px-1 py-0.5 text-[10px] text-white">HO</span>}
        {d.isRest && <span className="rounded bg-green-700 px-1 py-0.5 text-[10px] text-white">Rest</span>}
        {d.isCapital && <span className="rounded bg-amber-700 px-1 py-0.5 text-[10px] text-white">Capital</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
