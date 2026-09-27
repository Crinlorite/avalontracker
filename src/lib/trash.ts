import { prisma } from "@/lib/prisma";

// Ventana de recuperación de la papelera, común a web y app (spec §6.4).
export const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function trashDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_TTL_MS);
}

// Barrido de la papelera en TODOS los mapas: tarea de fondo en
// instrumentation.ts, así también se vacía en los mapas que solo usa la
// app (antes solo corría en el GET web de rutas). Idempotente.
export async function sweepTrash(now = new Date()): Promise<{ hops: number; routes: number }> {
  const ttlAgo = new Date(now.getTime() - TRASH_TTL_MS);
  // 1) Saltos en la papelera más allá del TTL: ventana de recuperación cerrada.
  const hops = await prisma.routeHop.deleteMany({ where: { deletedAt: { lt: ttlAgo } } });
  // 2) Rutas enteras en la papelera más allá del TTL.
  const trashed = await prisma.route.deleteMany({ where: { deletedAt: { lt: ttlAgo } } });
  // 3) Rutas que ya no tienen ningún salto (ni vivo ni en la papelera):
  //    el paso 1 puede haber dejado huérfanas.
  const empty = await prisma.route.deleteMany({ where: { hops: { none: {} } } });
  // 4) Legado: EXPIRED viejas de antes de la papelera por salto.
  const legacy = await prisma.route.deleteMany({ where: { status: "EXPIRED", updatedAt: { lt: ttlAgo } } });
  return { hops: hops.count, routes: trashed.count + empty.count + legacy.count };
}
