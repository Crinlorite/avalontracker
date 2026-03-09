import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClanMember, requireRole } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { ClanRole } from "@/generated/prisma/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId } = await params;

  try {
    await requireClanMember(session.user.id, clanId);
  } catch {
    return NextResponse.json({ error: "No eres miembro de este clan" }, { status: 403 });
  }

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    include: {
      _count: {
        select: { members: true },
      },
    },
  });

  if (!clan) {
    return NextResponse.json({ error: "Clan no encontrado" }, { status: 404 });
  }

  return NextResponse.json(clan);
}

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
    await requireRole(session.user.id, clanId, ClanRole.OWNER);
  } catch {
    return NextResponse.json({ error: "Solo el OWNER puede modificar el clan" }, { status: 403 });
  }

  const body = await request.json();
  const { name, settings } = body;

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name.trim();
  if (settings) updateData.settings = settings;

  const clan = await prisma.clan.update({
    where: { id: clanId },
    data: updateData,
  });

  await logAudit(clanId, session.user.id, "SETTINGS_CHANGE", undefined, updateData);

  return NextResponse.json(clan);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId } = await params;

  try {
    await requireRole(session.user.id, clanId, ClanRole.OWNER);
  } catch {
    return NextResponse.json({ error: "Solo el OWNER puede eliminar el clan" }, { status: 403 });
  }

  await prisma.clan.delete({
    where: { id: clanId },
  });

  await logAudit(clanId, session.user.id, "SETTINGS_CHANGE");

  return NextResponse.json({ success: true });
}
