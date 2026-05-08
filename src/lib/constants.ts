export const PORTAL_SIZES = [7, 20] as const;
export type PortalSize = (typeof PORTAL_SIZES)[number];

export const TIMER_THRESHOLDS = {
  GREEN: 60, // > 60 min
  ORANGE: 30, // > 30 min
  RED: 0, // > 0 min
  EXPIRED: -1, // <= 0
} as const;

export const TIMER_COLORS = {
  GREEN: "#22c55e",
  ORANGE: "#f97316",
  RED: "#ef4444",
  EXPIRED: "#3b82f6",
} as const;

export function getTimerColor(minutesRemaining: number): string {
  if (minutesRemaining <= 0) return TIMER_COLORS.EXPIRED;
  if (minutesRemaining < 30) return TIMER_COLORS.RED;
  if (minutesRemaining < 60) return TIMER_COLORS.ORANGE;
  return TIMER_COLORS.GREEN;
}

export const CLAN_ROLES_DISPLAY: Record<string, string> = {
  OWNER: "Líder",
  OFFICER: "Oficial",
  MEMBER: "Miembro",
};
