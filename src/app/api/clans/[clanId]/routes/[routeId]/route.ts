import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClanMember, requireRole } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { ClanRole, RouteStatus } from "@/generated/prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clanId: string; routeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId, routeId } = await params;

  try {
    await requireClanMember(session.user.id, clanId);
  } catch {
    return NextResponse.json({ error: "No eres miembro de este clan" }, { status: 403 });
  }

  const route = await prisma.route.findUnique({
    where: { id: routeId },
  });

  if (!route || route.clanId !== clanId) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  const updated = await prisma.route.update({
    where: { id: routeId },
    data: {
      status: RouteStatus.DISABLED,
      disabledById: session.user.id,
      disabledAt: new Date(),
    },
  });

  await logAudit(clanId, session.user.id, "ROUTE_DISABLE", routeId);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clanId: string; routeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clanId, routeId } = await params;

  try {
    await requireRole(session.user.id, clanId, ClanRole.OFFICER);
  } catch {
    return NextResponse.json(
      { error: "Se requiere rol OFFICER o superior" },
      { status: 403 }
    );
  }

  const route = await prisma.route.findUnique({
    where: { id: routeId },
  });

  if (!route || route.clanId !== clanId) {
    return NextResponse.json({ error: "Ruta no encontrada" }, { status: 404 });
  }

  await prisma.route.delete({
    where: { id: routeId },
  });

  await logAudit(clanId, session.user.id, "ROUTE_DELETE", routeId);

  return NextResponse.json({ success: true });
}
