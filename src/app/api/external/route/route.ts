import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// API key auth for external tools (Loot Vigil)
function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected || !apiKey) return false;
  return apiKey === expected;
}

interface ExternalHop {
  fromZone: string;
  toZone: string;
  fromName?: string;
  toName?: string;
  portalSize?: number;
  expiresAt?: string;
}

// POST /api/external/route — create route from Loot Vigil
export async function POST(request: Request) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json();
  const { clanId, userId, hops } = body as {
    clanId: string;
    userId: string;
    hops: ExternalHop[];
  };

  if (!clanId || !userId || !hops || !Array.isArray(hops) || hops.length === 0) {
    return NextResponse.json(
      { error: "clanId, userId, and hops[] required" },
      { status: 400 }
    );
  }

  // Verify user is clan member
  const membership = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId } },
  });
  if (!membership) {
    return NextResponse.json({ error: "User not in clan" }, { status: 403 });
  }

  // Ensure zones exist in DB
  for (const hop of hops) {
    for (const zoneName of [hop.fromZone, hop.toZone]) {
      const existing = await prisma.zone.findUnique({ where: { name: zoneName } });
      if (!existing) {
        // Auto-create zone from name
        const type = zoneName.startsWith("TNL-") ? "AVALON"
          : zoneName.startsWith("BLACKBANK-") ? "OUTLANDS"
          : "ROYAL";
        await prisma.zone.create({
          data: { name: zoneName, type },
        });
      }
    }
  }

  const route = await prisma.route.create({
    data: {
      clanId,
      createdById: userId,
      hops: {
        create: hops.map((hop, index) => ({
          order: index,
          fromZone: hop.fromZone.trim(),
          toZone: hop.toZone.trim(),
          portalSize: hop.portalSize || 7,
          expiresAt: hop.expiresAt ? new Date(hop.expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
        })),
      },
    },
    include: {
      hops: { orderBy: { order: "asc" } },
    },
  });

  const zones = [hops[0].fromZone, ...hops.map((h) => h.toZone)].join(" → ");
  await logAudit(clanId, userId, "ROUTE_CREATE_EXTERNAL", route.id, {
    zones,
    hopCount: hops.length,
    source: "loot-vigil",
  });

  return NextResponse.json(route, { status: 201 });
}
