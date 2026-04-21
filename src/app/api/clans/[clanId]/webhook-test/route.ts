import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { discordWebhookUrl: true } });
  if (!clan?.discordWebhookUrl) return apiError("VALIDATION_ERROR", 400, "Webhook no configurado");

  try {
    const res = await fetch(clan.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "🧪 Test desde Avalon Tracker — webhook funcionando." }),
    });
    if (!res.ok) return apiError("VALIDATION_ERROR", 400, `Webhook respondió ${res.status}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
