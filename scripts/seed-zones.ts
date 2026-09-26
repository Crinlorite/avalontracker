import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { RENAMED_ZONES } from "./zone-renames";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type AvalonZone = {
  name: string;
  tier: number;
  zoneClass: string;
  hasHideout: boolean;
  resources: unknown;
  chests: unknown;
  dungeons: { type: string; count: number }[];
  nodes: unknown;
};
// jsonb reordena las claves: se compara en forma canónica.
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

type WorldZone = { name: string; type: "ROYAL" | "OUTLANDS"; tier?: number; isCapital?: boolean };

// Sincroniza la tabla Zone con los JSON de src/data. Se ejecuta en cada
// arranque del contenedor, así que tiene que ser idempotente y barata:
//   1. Renombra las zonas de Avalon que venían con erratas (conserva el id,
//      y con él las rutas y anclas que ya apuntan a ellas).
//   2. Crea las zonas que falten.
//   3. Actualiza tier / hideout / datos de las de Avalon si han cambiado
//      (regenerar avalon-zones.json tras un parche del juego basta).
async function main() {
  const avalon = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/avalon-zones.json"), "utf8")) as AvalonZone[];
  const world = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/world-zones.json"), "utf8")) as WorldZone[];

  const existing = await prisma.zone.findMany({ select: { id: true, name: true, type: true, tier: true, hasHideout: true, hasDungeon: true, rawData: true } });
  const byName = new Map(existing.map((z) => [z.name, z]));

  let renamed = 0;
  for (const [from, to] of Object.entries(RENAMED_ZONES)) {
    const old = byName.get(from);
    if (!old) continue;
    const target = byName.get(to);
    if (!target) {
      await prisma.zone.update({ where: { id: old.id }, data: { name: to } });
      byName.set(to, { ...old, name: to });
    } else {
      // El nombre bueno ya existía (world-zones.json lo traía como zona
      // del mundo): se pasan las referencias a esa fila y se borra la de la
      // errata. Conexiones y routing son derivados y se recalculan.
      await prisma.$transaction([
        prisma.routeHop.updateMany({ where: { fromZoneId: old.id }, data: { fromZoneId: target.id } }),
        prisma.routeHop.updateMany({ where: { toZoneId: old.id }, data: { toZoneId: target.id } }),
        prisma.clan.updateMany({ where: { anchorZoneId: old.id }, data: { anchorZoneId: target.id } }),
        prisma.zoneConnection.deleteMany({ where: { OR: [{ fromZoneId: old.id }, { toZoneId: old.id }] } }),
        prisma.zoneRouting.deleteMany({ where: { zoneId: old.id } }),
        prisma.zoneRouting.updateMany({ where: { nearestRoyalZoneId: old.id }, data: { nearestRoyalZoneId: null } }),
        prisma.zoneRouting.updateMany({ where: { nearestRestZoneId: old.id }, data: { nearestRestZoneId: null } }),
        prisma.zoneRouting.updateMany({ where: { nearestCapitalZoneId: old.id }, data: { nearestCapitalZoneId: null } }),
        prisma.zone.delete({ where: { id: old.id } }),
      ]);
    }
    byName.delete(from);
    renamed++;
  }

  let created = 0;
  let updated = 0;
  for (const z of avalon) {
    const data = {
      type: "AVALON" as const,
      tier: z.tier,
      hasHideout: z.hasHideout,
      hasDungeon: z.dungeons.length > 0,
      rawData: { zoneClass: z.zoneClass, resources: z.resources, chests: z.chests, dungeons: z.dungeons, nodes: z.nodes } as object,
    };
    const cur = byName.get(z.name);
    if (!cur) {
      await prisma.zone.create({ data: { name: z.name, ...data } });
      created++;
      continue;
    }
    const same = cur.type === data.type && cur.tier === data.tier && cur.hasHideout === data.hasHideout
      && cur.hasDungeon === data.hasDungeon && canon(cur.rawData) === canon(data.rawData);
    if (!same) {
      await prisma.zone.update({ where: { id: cur.id }, data });
      updated++;
    }
  }

  // Zonas del mundo: solo se crean las que falten. Si un nombre ya existe
  // como AVALON (duplicado entre JSONs), manda Avalon.
  const avalonNames = new Set(avalon.map((z) => z.name));
  const seen = new Set<string>();
  const missingWorld = world.filter((z) => {
    if (byName.has(z.name) || avalonNames.has(z.name) || seen.has(z.name)) return false;
    seen.add(z.name);
    return true;
  });
  if (missingWorld.length) {
    const r = await prisma.zone.createMany({
      data: missingWorld.map((z) => ({ name: z.name, type: z.type, tier: z.tier ?? null, isCapital: Boolean(z.isCapital) })),
      skipDuplicates: true,
    });
    created += r.count;
  }

  console.log(`[seed-zones] ${renamed} renombradas, ${created} creadas, ${updated} actualizadas`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
