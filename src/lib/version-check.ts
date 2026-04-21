export function parseIfMatch(header: string | null | undefined): number | null {
  if (!header) return null;
  const match = header.match(/^v=(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export class VersionMismatchError extends Error {
  public code = "CONFLICT" as const;
  constructor(public currentVersion: number) {
    super(`version mismatch: current=${currentVersion}`);
  }
}
