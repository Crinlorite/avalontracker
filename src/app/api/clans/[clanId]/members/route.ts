import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const members = await prisma.clanMember.findMany({
    where: {
      clanId,
      // Filtramos miembros sin rol mapeado — están en el server Discord
      // pero no les aplica ningún rol del clan. Consistente con /me/clans
      // que tampoco los lista. Evita que el roster se ensucie con users
      // que simplemente están en el guild sin ser "miembros activos" del
      // clan en términos de la app.
      appRole: { not: null },
    },
    include: {
      // discordId incluido para construir avatarUrl server-side (ver más abajo).
      // No se expone en el output — se elimina tras mapear.
      user: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true, discordId: true } },
    },
    orderBy: [{ appRole: "desc" }, { joinedAt: "asc" }],
    take: 500,
  });

  // Construimos el URL del avatar en el server para evitar filtrar el
  // discordId al cliente. Fallback: avatar por defecto de Discord según el
  // algoritmo nuevo post-2023 (user_id >> 22) % 6 — usa BigInt() sin
  // literales para compat con targets TS pre-ES2020.
  const payload = members.map((m) => {
    const { user, ...rest } = m;
    const { discordId, discordAvatar, ...userSafe } = user;
    const defaultIdx = Number((BigInt(discordId) >> BigInt(22)) % BigInt(6));
    const avatarUrl = discordAvatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${defaultIdx}.png`;
    return { ...rest, user: { ...userSafe, avatarUrl } };
  });

  return NextResponse.json(payload);
}
