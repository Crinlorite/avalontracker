import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { sendRouteToDiscord } from "@/lib/discord";
import { logAudit } from "@/lib/audit";
import { ClanRole } from "@/generated/prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId } = await params;

  try {
    await requireRole(session.user.id, clanId, ClanRole.OFFICER);
  } catch {
    return NextResponse.json(
      { error: "Se requiere rol OFFICER o superior" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { discordWebhookUrl } = body;

  const clan = await prisma.clan.update({
    where: { id: clanId },
    data: { discordWebhookUrl },
  });

  await logAudit(clanId, session.user.id, "WEBHOOK_UPDATE", undefined, { discordWebhookUrl: discordWebhookUrl ? "***" : null });

  return NextResponse.json({ success: true, discordWebhookUrl: clan.discordWebhookUrl });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId } = await params;

  try {
    await requireRole(session.user.id, clanId, ClanRole.OFFICER);
  } catch {
    return NextResponse.json(
      { error: "Se requiere rol OFFICER o superior" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { routeId } = body;

  if (!routeId) {
    return NextResponse.json(
      { error: "routeId es requerido" },
      { status: 400 }
    );
  }

  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: {
      clan: true,
      createdBy: {
        select: { displayName: true },
      },
    },
  });

  if (!route || route.clanId !== clanId) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  if (!route.clan.discordWebhookUrl) {
    return NextResponse.json(
      { error: "No hay webhook configurado para este clan" },
      { status: 400 }
    );
  }

  try {
    await sendRouteToDiscord(route.clan.discordWebhookUrl, {
      entryZone: route.entryZone,
      exitZone: route.exitZone,
      portalSize: route.portalSize,
      expiresAt: route.expiresAt.toISOString(),
      createdBy: route.createdBy.displayName || "Desconocido",
      status: route.status,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al enviar a Discord" },
      { status: 500 }
    );
  }
}
