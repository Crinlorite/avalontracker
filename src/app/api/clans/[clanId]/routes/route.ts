import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireClanMember } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

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
  if (status && ["ACTIVE", "EXPIRED", "DISABLED"].includes(status)) {
    where.status = status;
  }

  const routes = await prisma.route.findMany({
    where,
    include: {
      createdBy: {
        select: { id: true, displayName: true },
      },
      hops: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(routes);
}

interface HopInput {
  fromZone: string;
  toZone: string;
  portalSize: number;
  expiresAt: string;
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
  const { hops } = body as { hops: HopInput[] };

  if (!hops || !Array.isArray(hops) || hops.length === 0) {
    return NextResponse.json(
      { error: "Se requiere al menos un salto" },
      { status: 400 }
    );
  }

  if (hops.length > 12) {
    return NextResponse.json(
      { error: "Máximo 12 saltos por ruta" },
      { status: 400 }
    );
  }

  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    if (!hop.fromZone || !hop.toZone || !hop.portalSize || !hop.expiresAt) {
      return NextResponse.json(
        { error: `Salto ${i + 1}: todos los campos son requeridos` },
        { status: 400 }
      );
    }
    // Validate chain continuity
    if (i > 0 && hops[i - 1].toZone !== hop.fromZone) {
      return NextResponse.json(
        { error: `Salto ${i + 1}: la zona de entrada debe coincidir con la salida del salto anterior` },
        { status: 400 }
      );
    }
  }

  const route = await prisma.route.create({
    data: {
      clanId,
      createdById: session.user.id,
      hops: {
        create: hops.map((hop, index) => ({
          order: index,
          fromZone: hop.fromZone.trim(),
          toZone: hop.toZone.trim(),
          portalSize: hop.portalSize,
          expiresAt: new Date(hop.expiresAt),
        })),
      },
    },
    include: {
      hops: { orderBy: { order: "asc" } },
    },
  });

  const zones = [hops[0].fromZone, ...hops.map((h) => h.toZone)].join(" → ");
  await logAudit(clanId, session.user.id, "ROUTE_CREATE", route.id, { zones, hopCount: hops.length });

  return NextResponse.json(route, { status: 201 });
}
