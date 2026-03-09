import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClanMember, requireRole } from "@/lib/permissions";
import { consumeInviteCode } from "@/lib/invite-codes";
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

  const members = await prisma.clanMember.findMany({
    where: { clanId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          image: true,
        },
      },
    },
  });

  const result = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    displayName: m.user.displayName,
    image: m.user.image,
    role: m.role,
    joinedAt: m.joinedAt,
  }));

  return NextResponse.json(result);
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
  const { code } = body;

  if (!code || typeof code !== "string") {
    return NextResponse.json(
      { error: "Código de invitación requerido" },
      { status: 400 }
    );
  }

  const result = await consumeInviteCode(code, clanId, session.user.id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await logAudit(clanId, session.user.id, "MEMBER_JOIN", result.user?.id, {
    code,
    displayName: result.user?.displayName,
  });

  return NextResponse.json(result, { status: 201 });
}
