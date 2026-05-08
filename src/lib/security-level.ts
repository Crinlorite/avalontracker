import type { SecurityLevel } from "@/hooks/useClan";

// Mapping compartido entre AnchorStatusCard (banner del clan) y
// ZoneNode (card del anchor en el grafo) para mantener consistencia
// visual: mismo color, mismo emoji, mismo glow.
export const SECURITY_LEVEL_META: Record<
  SecurityLevel,
  { color: string; label: string; bg: string; emoji: string }
> = {
  SAFE:    { color: "#22c55e", label: "Seguro",     bg: "rgba(34, 197, 94, 0.12)", emoji: "🟢" },
  CAUTION: { color: "#eab308", label: "Precaución", bg: "rgba(234, 179, 8, 0.12)", emoji: "🟡" },
  DANGER:  { color: "#ef4444", label: "Peligro",    bg: "rgba(239, 68, 68, 0.12)", emoji: "🔴" },
};
