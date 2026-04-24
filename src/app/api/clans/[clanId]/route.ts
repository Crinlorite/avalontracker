import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { isDiscordWebhookUrl } from "@/lib/webhook-url";

const patchSchema = z.object({
  name: z.string().min(3).max(40).optional(),
  // Solo se acepta una URL de webhook Discord real — bloqueo de SSRF.
  discordWebhookUrl: z.string()
    .refine(isDiscordWebhookUrl, "Debe ser una URL válida de webhook Discord (discord.com/api/webhooks/...)")
    .nullable()
    .optional(),
  anchorZoneId: z.number().int().positive().nullable().optional(),
}).strict();

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

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    include: {
      _count: { select: { members: true, routes: true } },
      anchorZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true } },
    },
  });
  if (!clan) return apiError("NOT_FOUND", 404, "Clan no encontrado");
  return NextResponse.json(clan);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const clan = await prisma.clan.update({
    where: { id: clanId },
    data: parsed.data,
  });

  await logAudit(clanId, session.user.id, "SETTINGS_CHANGE", undefined, parsed.data as Record<string, unknown>);

  return NextResponse.json(clan);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  await prisma.clan.delete({ where: { id: clanId } });
  return new NextResponse(null, { status: 204 });
}
