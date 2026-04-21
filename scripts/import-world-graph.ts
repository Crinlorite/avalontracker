import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type EdgeInput = { from: string; to: string; kind: "ROYAL_ROAD" | "AVALON_STATIC" | "AVALON_TO_ROYAL" | "OUTLANDS_ROAD" };

async function main() {
  const file = path.join(process.cwd(), "src/data/world-graph.json");
  if (!fs.existsSync(file)) { console.log("[world-graph] no file, skip"); return; }
  const raw = fs.readFileSync(file, "utf8").trim();
  if (!raw || raw === "{}" || raw === "[]") { console.log("[world-graph] empty, skip"); return; }

  const existing = await prisma.zoneConnection.count();
  if (existing > 0) { console.log(`[world-graph] already populated (${existing}), skip`); return; }

  const data = JSON.parse(raw) as { connections: EdgeInput[] };
  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });
  const byName = new Map(zones.map((z) => [z.name, z.id]));

  let inserted = 0, skipped = 0;
  for (const c of data.connections ?? []) {
    const fromId = byName.get(c.from);
    const toId = byName.get(c.to);
    if (!fromId || !toId) { skipped++; continue; }
    try {
      await prisma.zoneConnection.create({ data: { fromZoneId: fromId, toZoneId: toId, connectionType: c.kind } });
      inserted++;
    } catch {
      skipped++;
    }
  }
  console.log(`[world-graph] ${inserted} inserted, ${skipped} skipped`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
