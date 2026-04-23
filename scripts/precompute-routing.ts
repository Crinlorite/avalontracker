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
  if (connCount === 0) { console.log("[routing] no connections, skip"); await prisma.$disconnect(); return; }

  // Si ya hay datos, verificamos que tengan la cobertura nueva (royal + capital).
  // Si falta cualquiera de las dos, wipe y recompute para migrar al schema extendido.
  if (existing > 0) {
    const royalCovered = await prisma.zoneRouting.findFirst({
      where: { zone: { type: "ROYAL" } },
      select: { zoneId: true },
    });
    const capitalCovered = await prisma.zoneRouting.findFirst({
      where: { nearestCapitalZoneId: { not: null } },
      select: { zoneId: true },
    });
    if (royalCovered && capitalCovered) {
      console.log(`[routing] already populated (${existing}), skip`);
      await prisma.$disconnect();
      return;
    }
    console.log(`[routing] schema upgrade detected (royal=${!!royalCovered} capital=${!!capitalCovered}), wiping and recomputing`);
    await prisma.zoneRouting.deleteMany({});
  }

  const conns = await prisma.zoneConnection.findMany({ select: { fromZoneId: true, toZoneId: true } });
  const adj = new Map<number, number[]>();
  for (const c of conns) {
    if (!adj.has(c.fromZoneId)) adj.set(c.fromZoneId, []);
    if (!adj.has(c.toZoneId))   adj.set(c.toZoneId, []);
    adj.get(c.fromZoneId)!.push(c.toZoneId);
    adj.get(c.toZoneId)!.push(c.fromZoneId);
  }

  const royals    = new Set((await prisma.zone.findMany({ where: { type: "ROYAL" }, select: { id: true } })).map((z) => z.id));
  const rests     = new Set((await prisma.zone.findMany({ where: { type: "AVALON", isRest: true }, select: { id: true } })).map((z) => z.id));
  const capitals  = new Set((await prisma.zone.findMany({ where: { isCapital: true }, select: { id: true } })).map((z) => z.id));
  // Ahora procesamos AVALON + ROYAL para que un user en zona royal también vea
  // "ciudad más cercana + rest" al clickar en la vista grafo.
  const zones = await prisma.zone.findMany({
    where: { type: { in: ["AVALON", "ROYAL"] } },
    select: { id: true },
  });

  const now = new Date();
  let n = 0;
  for (const z of zones) {
    const r        = bfsToTarget(z.id, royals, adj);
    const rest     = bfsToTarget(z.id, rests, adj);
    const capital  = bfsToTarget(z.id, capitals, adj);
    await prisma.zoneRouting.create({
      data: {
        zoneId: z.id,
        nearestRoyalZoneId: r?.targetId ?? null,
        hopsToRoyal: r?.hops ?? null,
        nearestRestZoneId: rest?.targetId ?? null,
        hopsToRest: rest?.hops ?? null,
        nearestCapitalZoneId: capital?.targetId ?? null,
        hopsToCapital: capital?.hops ?? null,
        computedAt: now,
      },
    });
    if (++n % 200 === 0) console.log(`[routing] ${n}/${zones.length}`);
  }
  console.log(`[routing] done, ${n} zones (AVALON + ROYAL)`);
  await prisma.$disconnect();
}

if (process.env.VITEST !== "true" && process.argv[1]?.includes("precompute-routing")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
