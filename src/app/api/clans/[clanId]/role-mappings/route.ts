import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError, invalidateRoleCache } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const upsertSchema = z.object({
  discordRoleId: z.string().regex(/^\d{17,20}$/),
  discordRoleName: z.string().min(1).max(100),
  appRole: z.enum(["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"]),
});

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }
  const mappings = await prisma.clanRoleMapping.findMany({ where: { clanId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(mappings);
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const mapping = await prisma.clanRoleMapping.upsert({
    where: { clanId_discordRoleId: { clanId, discordRoleId: parsed.data.discordRoleId } },
    create: { clanId, ...parsed.data },
    update: { appRole: parsed.data.appRole, discordRoleName: parsed.data.discordRoleName },
  });

  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, action: "ROLE_MAPPING_CHANGE", details: parsed.data as object },
  });

  const members = await prisma.clanMember.findMany({ where: { clanId }, select: { userId: true } });
  for (const m of members) invalidateRoleCache(m.userId, clanId);

  return NextResponse.json(mapping, { status: 201 });
}
