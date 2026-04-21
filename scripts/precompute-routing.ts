import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function bfsToTarget(
  start: number,
  targets: Set<number>,
  adj: Map<number, number[]>
): { targetId: number; hops: number } | null {
  const queue: Array<[number, number]> = [[start, 0]];
  const visited = new Set([start]);
  while (queue.length) {
    const [current, hops] = queue.shift()!;
    if (targets.has(current) && current !== start) return { targetId: current, hops };
    for (const next of adj.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, hops + 1]);
      }
    }
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

  const existing = await prisma.zoneRouting.count();
  const connCount = await prisma.zoneConnection.count();
  if (existing > 0) { console.log(`[routing] already populated (${existing}), skip`); await prisma.$disconnect(); return; }
  if (connCount === 0) { console.log("[routing] no connections, skip"); await prisma.$disconnect(); return; }

  const conns = await prisma.zoneConnection.findMany({ select: { fromZoneId: true, toZoneId: true } });
  const adj = new Map<number, number[]>();
  for (const c of conns) {
    if (!adj.has(c.fromZoneId)) adj.set(c.fromZoneId, []);
    if (!adj.has(c.toZoneId))   adj.set(c.toZoneId, []);
    adj.get(c.fromZoneId)!.push(c.toZoneId);
    adj.get(c.toZoneId)!.push(c.fromZoneId);
  }

  const royals = new Set((await prisma.zone.findMany({ where: { type: "ROYAL" }, select: { id: true } })).map((z) => z.id));
  const rests = new Set((await prisma.zone.findMany({ where: { type: "AVALON", isRest: true }, select: { id: true } })).map((z) => z.id));
  const avalons = await prisma.zone.findMany({ where: { type: "AVALON" }, select: { id: true } });

  const now = new Date();
  let n = 0;
  for (const z of avalons) {
    const r = bfsToTarget(z.id, royals, adj);
    const rest = bfsToTarget(z.id, rests, adj);
    await prisma.zoneRouting.create({
      data: {
        zoneId: z.id,
        nearestRoyalZoneId: r?.targetId ?? null,
        hopsToRoyal: r?.hops ?? null,
        nearestRestZoneId: rest?.targetId ?? null,
        hopsToRest: rest?.hops ?? null,
        computedAt: now,
      },
    });
    if (++n % 200 === 0) console.log(`[routing] ${n}/${avalons.length}`);
  }
  console.log(`[routing] done, ${n} zones`);
  await prisma.$disconnect();
}

if (process.env.VITEST !== "true" && process.argv[1]?.includes("precompute-routing")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
