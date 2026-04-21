import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: session.user.id, appRole: { not: null } } } },
    include: { members: { where: { userId: session.user.id }, select: { appRole: true } } },
  });
  return NextResponse.json(clans.map((c) => ({
    id: c.id, name: c.name, discordGuildId: c.discordGuildId, discordGuildName: c.discordGuildName, discordGuildIcon: c.discordGuildIcon,
    myRole: c.members[0]?.appRole ?? null,
  })));
}
