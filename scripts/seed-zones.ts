import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const exists = await prisma.zone.count();
  if (exists > 0) {
    console.log(`[seed-zones] ya pobladas (${exists} zones), skip`);
    return;
  }

  const avalon = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/avalon-zones.json"), "utf8")) as Array<{
    name: string; tier?: number; resources?: unknown; chests?: unknown; dungeons?: unknown; isRest?: boolean; hasHideout?: boolean;
  }>;
  const world = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/world-zones.json"), "utf8")) as Array<{
    name: string; type: "ROYAL" | "OUTLANDS"; tier?: number; isCapital?: boolean;
  }>;

  let n = 0;
  for (const z of avalon) {
    await prisma.zone.create({
      data: {
        name: z.name,
        type: "AVALON",
        tier: z.tier ?? null,
        hasHideout: Boolean(z.hasHideout),
        isRest: Boolean(z.isRest),
        rawData: { resources: z.resources, chests: z.chests, dungeons: z.dungeons },
      },
    });
    if (++n % 100 === 0) console.log(`[seed-zones] ${n} avalon...`);
  }
  for (const z of world) {
    await prisma.zone.create({
      data: {
        name: z.name,
        type: z.type,
        tier: z.tier ?? null,
        isCapital: Boolean(z.isCapital),
      },
    });
    if (++n % 100 === 0) console.log(`[seed-zones] ${n} total...`);
  }
  console.log(`[seed-zones] done, ${n} zones`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
