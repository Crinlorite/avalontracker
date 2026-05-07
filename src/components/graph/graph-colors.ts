import type { HopView } from "@/hooks/useClanRoutes";
import { colorForMinutes, minutesLeft } from "@/lib/time";
import { borderColorForPvp, getZonePvp } from "@/lib/world-meta";

export function edgeColorForHop(hop: HopView): string {
  if (hop.status === "EXPIRED") return "#3b82f6";
  if (hop.status === "COLLAPSED") return "#6b7280";
  if (hop.status === "WATCHED") return "#fbbf24";
  return colorForMinutes(minutesLeft(hop.expiresAt));
}

export function edgeWidthForPortal(size: number): number {
  if (size === 7) return 1.5;
  if (size === 20) return 3;
  if (size === 40) return 5;
  return 2;
}

export function edgeDashForHop(hop: HopView): string | undefined {
  if (hop.status === "COLLAPSED") return "4 2";
  return undefined;
}

export function nodeColorForZoneType(type: string): string {
  if (type === "AVALON") return "#7c3aed";
  if (type === "ROYAL") return "#2563eb";
  if (type === "OUTLANDS") return "#dc2626";
  return "#64748b";
}

// Color preferido por NOMBRE de zona usando world-meta (pvp real del
// dump de Albion). Cae a nodeColorForZoneType si la zona no está en el
// dump (raro, solo zonas custom o data desactualizada).
export function nodeBorderColorForZone(name: string, fallbackType: string): string {
  const pvp = getZonePvp(name);
  if (pvp) return borderColorForPvp(pvp);
  return nodeColorForZoneType(fallbackType);
}
