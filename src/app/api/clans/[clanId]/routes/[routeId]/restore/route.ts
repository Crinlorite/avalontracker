import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/clans/[clanId]/routes/[routeId]/restore
//
// Restaura hops soft-deleteados (deletedAt = null). Si el cliente pasa
// `hopIds` en el body, restaura solo esos. Si no, restaura todos los
// hops soft-deleteados de la route. Bumpea version para optimistic
// concurrency.
//
// Como side-effect, si la Route estaba EXPIRED y ahora tiene al menos
// un hop con expiresAt en el futuro, la pasamos a ACTIVE para que
// vuelva a aparecer en la lista por defecto.

const bodySchema = z.object({ hopIds: z.array(z.number().int()).max(100).optional() }).strict();

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const raw = await req.text();
  let hopIds: number[] | undefined;
  if (raw.trim()) {
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return apiError("VALIDATION_ERROR", 400, "JSON inválido"); }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Body inválido", { issues: parsed.error.issues });
    hopIds = parsed.data.hopIds;
  }

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: { hops: true },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  const trashedHops = route.hops.filter((h) => h.deletedAt !== null);
  if (trashedHops.length === 0) {
    return apiError("VALIDATION_ERROR", 400, "Esta ruta no tiene hops borrados");
  }

  let toRestoreIds: number[];
  if (hopIds && hopIds.length > 0) {
    const trashedSet = new Set(trashedHops.map((h) => h.id));
    toRestoreIds = hopIds.filter((id) => trashedSet.has(id));
    if (toRestoreIds.length === 0) {
      return apiError("VALIDATION_ERROR", 400, "Ningún hopId está en la papelera");
    }
  } else {
    toRestoreIds = trashedHops.map((h) => h.id);
  }

  const now = new Date();

  // Si la Route era EXPIRED y al menos uno de los hops restaurados
  // tiene expiresAt en el futuro, la reactivamos a ACTIVE para que
  // vuelva a la lista por defecto. Si todos los hops restaurados ya
  // están vencidos, la dejamos como EXPIRED — el barrido lazy del
  // próximo GET decidirá si resucita o no.
  const restoringHops = trashedHops.filter((h) => toRestoreIds.includes(h.id));
  const anyAlive = restoringHops.some((h) => h.expiresAt.getTime() > now.getTime());
  const shouldReactivate = route.status === "EXPIRED" && anyAlive;

  await prisma.$transaction([
    prisma.routeHop.updateMany({
      where: { id: { in: toRestoreIds } },
      data: { deletedAt: null },
    }),
    prisma.route.update({
      where: { id: routeId },
      data: {
        version: { increment: 1 },
        ...(shouldReactivate ? { status: "ACTIVE" } : {}),
      },
    }),
  ]);

  await logAudit(clanId, session.user.id, "ROUTE_HOPS_RESTORE", routeId, {
    hopIds: toRestoreIds,
    reactivated: shouldReactivate,
  });

  return NextResponse.json({ ok: true, restored: toRestoreIds.length, reactivated: shouldReactivate });
}
