import { PrismaClient } from "../src/generated/prisma/client";
import avalonZones from "../src/data/avalon-zones.json";
import worldZones from "../src/data/world-zones.json";

const prisma = new PrismaClient();

interface ZoneData {
  name: string;
  type: string;
  tier: number | null;
  resources: unknown | null;
  chests: unknown | null;
  dungeons: unknown | null;
}

async function main() {
  console.log("Seeding zones...");

  const allZones: ZoneData[] = [
    ...(avalonZones as ZoneData[]),
    ...(worldZones as ZoneData[]),
  ];

  let created = 0;
  let updated = 0;

  for (const zone of allZones) {
    const result = await prisma.zone.upsert({
      where: { name: zone.name },
      update: {
        type: zone.type as "AVALON" | "ROYAL" | "OUTLANDS",
        tier: zone.tier,
        resources: zone.resources ?? undefined,
        chests: zone.chests ?? undefined,
        dungeons: zone.dungeons ?? undefined,
      },
      create: {
        name: zone.name,
        type: zone.type as "AVALON" | "ROYAL" | "OUTLANDS",
        tier: zone.tier,
        resources: zone.resources ?? undefined,
        chests: zone.chests ?? undefined,
        dungeons: zone.dungeons ?? undefined,
      },
    });

    if (result) {
      // upsert doesn't tell us if it was create or update,
      // but we count all as processed
      created++;
    }

    if (created % 50 === 0) {
      console.log(`  Processed ${created}/${allZones.length} zones...`);
    }
  }

  console.log(`Seeding complete. Processed ${created} zones total.`);
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
