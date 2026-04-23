import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { sendRouteToDiscord } from "@/lib/discord";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

// Discord rate-limita los webhooks (~5/2s) y bloquea el webhook si lo
// pasamos. 10/min por user es holgado para uso normal y evita que un
// usuario (o bot) tumbe el webhook del clan.
const pushLimiter = createLimiter({ windowMs: 60_000, max: 10 });

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(pushLimiter, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { discordWebhookUrl: true },
  });
  if (!clan?.discordWebhookUrl) {
    return apiError("VALIDATION_ERROR", 400, "Este clan no tiene webhook Discord configurado");
  }

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: {
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { discordUsername: true, displayName: true, globalNickname: true } },
    },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");
  if (route.hops.length === 0) return apiError("VALIDATION_ERROR", 400, "La ruta no tiene hops");

  const createdByName =
    route.createdBy.displayName ??
    route.createdBy.globalNickname ??
    route.createdBy.discordUsername;

  try {
    await sendRouteToDiscord(clan.discordWebhookUrl, {
      status: route.status,
      createdBy: createdByName,
      hops: route.hops.map((h) => ({
        fromZone: h.fromZone.name,
        toZone: h.toZone.name,
        portalSize: h.portalSize,
        expiresAt: h.expiresAt.toISOString(),
        status: h.status,
      })),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError("VALIDATION_ERROR", 400, e instanceof Error ? e.message : "Error enviando a Discord");
  }
}
