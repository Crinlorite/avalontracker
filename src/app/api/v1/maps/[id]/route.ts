import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRateLimit, getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const rl = apiRateLimit(me);
  if (rl) return rl;
  const { id } = await params;
  try {
    const { role } = await requireRole(me.userId, id, "VIEWER", "GET");
    const clan = await prisma.clan.findUnique({ where: { id }, include: { anchorZone: { select: { name: true } } } });
    if (!clan) return apiError("NOT_FOUND", 404, "Mapa no encontrado");
    return NextResponse.json({ id: clan.id, name: clan.name, kind: clan.kind, myRole: role, anchorZone: clan.anchorZone?.name ?? null, updatedAt: clan.updatedAt.toISOString() });
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }
}
