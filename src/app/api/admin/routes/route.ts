import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const status = (url.searchParams.get("status") ?? "ACTIVE") as "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL";
  const zone = url.searchParams.get("zone");
  const clanId = url.searchParams.get("clanId");

  const where: Record<string, unknown> = {};
  if (status !== "ALL") where.status = status;
  if (clanId) where.clanId = clanId;
  if (zone) where.hops = { some: { OR: [{ fromZone: { name: zone } }, { toZone: { name: zone } }] } };

  const [data, total] = await Promise.all([
    prisma.route.findMany({
      where,
      include: {
        clan: { select: { id: true, name: true } },
        hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
        createdBy: { select: { id: true, discordUsername: true, displayName: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.route.count({ where }),
  ]);
  return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}
