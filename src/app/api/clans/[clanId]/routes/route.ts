import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClanMember } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { RouteStatus } from "@/generated/prisma/client";

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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { clanId };
  if (status && Object.values(RouteStatus).includes(status as RouteStatus)) {
    where.status = status;
  }

  const routes = await prisma.route.findMany({
    where,
    include: {
      createdBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(routes);
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
    await requireClanMember(session.user.id, clanId);
  } catch {
    return NextResponse.json({ error: "No eres miembro de este clan" }, { status: 403 });
  }

  const body = await request.json();
  const { entryZone, exitZone, portalSize, expiresAt } = body;

  if (!entryZone || !exitZone || !portalSize || !expiresAt) {
    return NextResponse.json(
      { error: "entryZone, exitZone, portalSize y expiresAt son requeridos" },
      { status: 400 }
    );
  }

  const route = await prisma.route.create({
    data: {
      clanId,
      createdById: session.user.id,
      entryZone,
      exitZone,
      portalSize,
      expiresAt: new Date(expiresAt),
    },
  });

  await logAudit(clanId, session.user.id, "ROUTE_CREATE", route.id, { entryZone, exitZone, portalSize });

  return NextResponse.json(route, { status: 201 });
}
