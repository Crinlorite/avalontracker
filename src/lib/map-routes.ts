import { prisma } from "@/lib/prisma";
import type { RouteView } from "@/hooks/useClanRoutes";

// Rutas activas con saltos vivos, en la misma forma que GET /api/clans/{id}/routes
// (sin los barridos de mantenimiento). Para /m/<token> y la API de enlaces.
// Se devuelve ya serializado (fechas como ISO), igual que lo recibe el cliente.
export async function loadActiveRoutes(clanId: string): Promise<{ routes: RouteView[]; now: string }> {
  const now = new Date();
  const rows = await prisma.route.findMany({
    where: { clanId, status: "ACTIVE", deletedAt: null },
    include: {
      hops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  // Un enlace de ver no debe identificar a los editores: solo el nombre
  // visible que cada uno eligió; nada de usuario, apodo ni avatar de Discord.
  const routes = (JSON.parse(JSON.stringify(rows)) as RouteView[]).map((r) => ({
    ...r,
    createdBy: { id: "", discordUsername: "", displayName: r.createdBy.displayName, globalNickname: null, discordAvatar: null },
  }));
  return { routes, now: now.toISOString() };
}
