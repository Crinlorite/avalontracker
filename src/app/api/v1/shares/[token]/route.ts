import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { verifyShare, shareLookupLimiter } from "@/lib/map-shares";
import { loadActiveRoutes } from "@/lib/map-routes";
import { consumeToken, peekBlocked } from "@/lib/rate-limit";

// Público: el token es el secreto. 20 consultas por minuto e IP frenan
// cualquier intento de adivinar (2^128 posibilidades).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (peekBlocked(shareLookupLimiter, ip)) return apiError("RATE_LIMITED", 429, "Demasiados intentos");
  const { token } = await params;
  try {
    const share = await verifyShare(token);
    // Solo los fallos consumen cupo: un enlace válido nunca se bloquea a sí mismo.
    if (!share) { consumeToken(shareLookupLimiter, ip); return apiError("NOT_FOUND", 404, "Enlace no válido"); }
    const clan = await prisma.clan.findUniqueOrThrow({
      where: { id: share.clanId },
      include: { anchorZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true } } },
    });
    const { routes, now } = await loadActiveRoutes(share.clanId);
    return NextResponse.json({ map: { id: clan.id, name: clan.name, anchorZone: clan.anchorZone }, role: share.role, routes, now });
  } catch (e) { return internalError(e); }
}
