import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// API key auth
function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected || !apiKey) return false;
  return apiKey === expected;
}

// POST /api/external/zone-change — report a single zone transition
// Loot Vigil calls this every time response 191 fires
export async function POST(request: Request) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json();
  const { fromZoneId, toZoneId, fromName, toName, fromType, toType, timestamp } = body as {
    fromZoneId: string;
    toZoneId: string;
    fromName?: string;
    toName?: string;
    fromType?: string;
    toType?: string;
    timestamp?: string;
  };

  if (!fromZoneId || !toZoneId) {
    return NextResponse.json({ error: "fromZoneId and toZoneId required" }, { status: 400 });
  }

  // Auto-create zones if they don't exist
  for (const [zoneId, name, type] of [
    [fromZoneId, fromName, fromType],
    [toZoneId, toName, toType],
  ] as [string, string | undefined, string | undefined][]) {
    const zoneName = name || zoneId;
    const existing = await prisma.zone.findUnique({ where: { name: zoneName } });
    if (!existing) {
      const zoneType = type === "AVALON" || zoneId.startsWith("TNL-") ? "AVALON"
        : type === "OUTLANDS" || zoneId.startsWith("BLACKBANK-") ? "OUTLANDS"
        : "ROYAL";
      await prisma.zone.create({
        data: { name: zoneName, type: zoneType },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    from: fromName || fromZoneId,
    to: toName || toZoneId,
    recorded: timestamp || new Date().toISOString(),
  });
}
