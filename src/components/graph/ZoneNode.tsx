"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeColorForZoneType } from "./graph-colors";
import type { LayoutNode } from "./graph-layout";

export function ZoneNode({ data, selected }: NodeProps) {
  const d = data as unknown as LayoutNode;
  const color = nodeColorForZoneType(d.zoneType);
  return (
    <div className={`rounded-lg border-2 bg-slate-900 px-3 py-2 shadow ${selected ? "border-yellow-400" : "border-slate-700"}`} style={{ borderColor: selected ? "#facc15" : color }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="font-semibold text-white">{d.zoneName}</div>
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
