export function minutesLeft(expiresAt: Date | string): number {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return (target.getTime() - Date.now()) / 60_000;
}

export function colorForMinutes(m: number): string {
  if (m > 60) return "#22c55e";
  if (m > 30) return "#f97316";
  if (m > 0) return "#ef4444";
  return "#3b82f6";
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function secondsLeft(expiresAt: Date | string): number {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
}
