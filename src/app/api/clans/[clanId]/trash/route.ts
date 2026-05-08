import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

// TTL del soft-delete (debe coincidir con el de routes/route.ts).
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

type RouteParams = { params: Promise<{ clanId: string }> };

// GET /api/clans/[clanId]/trash
//
// Lista los hops soft-deleteados del clan, agrupados por evento de
// borrado (routeId + deletedAt exacto). Cada evento es lo que el
// usuario ve como "una entrada en la papelera": una cadena de hops
// que se borraron juntos (Route entera, o un path concreto de una
// Route con bifurcaciones).
//
// El countdown a hard-delete se calcula con la `deletedAt` de cada
// evento + TTL. Si un hop está fuera de TTL ya, simplemente no
// aparece — el barrido lazy del GET de rutas lo limpiará en cuanto
// alguien refresque la lista.
export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRole(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const now = new Date();
  const ttlAgo = new Date(now.getTime() - TTL_MS);

  const hops = await prisma.routeHop.findMany({
    where: {
      route: { clanId },
      deletedAt: { not: null, gte: ttlAgo },
    },
    orderBy: [{ deletedAt: "desc" }, { order: "asc" }],
    include: {
      fromZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true } },
      toZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true } },
      route: {
        select: {
          id: true,
          notes: true,
          status: true,
          createdBy: { select: { discordUsername: true, displayName: true, globalNickname: true } },
        },
      },
    },
  });

  // Agrupar por (routeId, deletedAt). Mismo timestamp = mismo evento de
  // borrado (DELETE handler usa un único Date.now() por request).
  type Event = {
    routeId: string;
    routeNotes: string | null;
    routeStatus: string;
    createdBy: string;
    deletedAt: string;
    expiresAt: string; // cuando se hard-deletea
    remainingMs: number;
    hops: typeof hops;
  };
  const eventsMap = new Map<string, Event>();
  for (const h of hops) {
    if (!h.deletedAt) continue;
    const key = `${h.routeId}|${h.deletedAt.toISOString()}`;
    if (!eventsMap.has(key)) {
      const expiresMs = h.deletedAt.getTime() + TTL_MS;
      const createdBy =
        h.route.createdBy.displayName ??
        h.route.createdBy.globalNickname ??
        h.route.createdBy.discordUsername;
      eventsMap.set(key, {
        routeId: h.routeId,
        routeNotes: h.route.notes,
        routeStatus: h.route.status,
        createdBy,
        deletedAt: h.deletedAt.toISOString(),
        expiresAt: new Date(expiresMs).toISOString(),
        remainingMs: Math.max(0, expiresMs - now.getTime()),
        hops: [],
      });
    }
    eventsMap.get(key)!.hops.push(h);
  }

  // Strip route field de los hops antes de devolver (ya está a nivel evento).
  const events = Array.from(eventsMap.values()).map((ev) => ({
    ...ev,
    hops: ev.hops.map(({ route: _r, ...rest }) => rest),
  }));

  return NextResponse.json({ events, now: now.toISOString() });
}
