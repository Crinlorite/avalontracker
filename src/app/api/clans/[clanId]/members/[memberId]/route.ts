import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { ClanRole } from "@/generated/prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clanId: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId, memberId } = await params;
  const memberIdNum = parseInt(memberId, 10);

  try {
    await requireRole(session.user.id, clanId, ClanRole.OWNER);
  } catch {
    return NextResponse.json(
      { error: "Solo el OWNER puede cambiar roles" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { role } = body;

  if (!role || !Object.values(ClanRole).includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const member = await prisma.clanMember.findUnique({
    where: { id: memberIdNum },
  });

  if (!member || member.clanId !== clanId) {
    return NextResponse.json(
      { error: "Miembro no encontrado" },
      { status: 404 }
    );
  }

  const updated = await prisma.clanMember.update({
    where: { id: memberIdNum },
    data: { role },
  });

  await logAudit(clanId, session.user.id, "MEMBER_ROLE_CHANGE", member.userId, {
    newRole: role,
    previousRole: member.role,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clanId: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId, memberId } = await params;
  const memberIdNum = parseInt(memberId, 10);

  try {
    await requireRole(session.user.id, clanId, ClanRole.OFFICER);
  } catch {
    return NextResponse.json(
      { error: "Se requiere rol OFFICER o superior" },
      { status: 403 }
    );
  }

  const member = await prisma.clanMember.findUnique({
    where: { id: memberIdNum },
  });

  if (!member || member.clanId !== clanId) {
    return NextResponse.json(
      { error: "Miembro no encontrado" },
      { status: 404 }
    );
  }

  if (member.role === ClanRole.OWNER) {
    return NextResponse.json(
      { error: "No se puede expulsar al OWNER del clan" },
      { status: 403 }
    );
  }

  await prisma.clanMember.delete({
    where: { id: memberIdNum },
  });

  await logAudit(clanId, session.user.id, "MEMBER_KICK", member.userId);

  return NextResponse.json({ success: true });
}
