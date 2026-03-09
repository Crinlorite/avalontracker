import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ClanRole } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const memberships = await prisma.clanMember.findMany({
    where: { userId: session.user.id },
    include: {
      clan: true,
    },
  });

  const clans = memberships.map((m) => ({
    ...m.clan,
    role: m.role,
  }));

  return NextResponse.json(clans);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "El nombre del clan es requerido" },
      { status: 400 }
    );
  }

  const clan = await prisma.clan.create({
    data: {
      name: name.trim(),
      createdById: session.user.id,
      members: {
        create: {
          userId: session.user.id,
          role: ClanRole.OWNER,
        },
      },
    },
    include: {
      members: true,
    },
  });

  await logAudit(clan.id, session.user.id, "CLAN_CREATE", undefined, { name: clan.name });

  return NextResponse.json(clan, { status: 201 });
}
