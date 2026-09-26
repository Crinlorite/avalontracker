// Ventana de recuperación de la papelera, común a web y app (spec §6.4).
export const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function trashDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_TTL_MS);
}
