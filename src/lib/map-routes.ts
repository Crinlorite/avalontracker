import { prisma } from "@/lib/prisma";

// Rutas activas con saltos vivos, en la misma forma que GET /api/clans/{id}/routes
// (sin los barridos de mantenimiento). Para /m/<token> y la API de enlaces.
export async function loadActiveRoutes(clanId: string) {
  const now = new Date();
  const routes = await prisma.route.findMany({
    where: { clanId, status: "ACTIVE", deletedAt: null },
    include: {
      hops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return { routes, now: now.toISOString() };
}
