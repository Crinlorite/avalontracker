// Genera src/data/chest-loot.json: categorías de botín por tipo de cofre,
// tamaño y tier, desde lootchests.json y loot.json del dump.
//   npx tsx scripts/extract-chest-loot.ts --sha <commit>
import fs from "node:fs";
import path from "node:path";
import { latestSha, cached } from "./dump-cache";
import { resolveChestCategories, type LootChestDef, type LootList } from "../src/lib/loot-categories";

const OUT = path.join(process.cwd(), "src/data/chest-loot.json");
// (tipo, tamaño) → grupo de definiciones del juego y tiers con tabla. Los
// tiers son los de los puntos de aparición de las plantillas (T4/T6/T8).
const GROUPS: Record<string, { group: string; tiers: number[] }> = {
  "GREEN:small": { group: "AVALON_SMALL_SOLO", tiers: [4, 6, 8] },
  "BLUE:large": { group: "AVALON_MEDIUM_VETERAN", tiers: [4, 6, 8] },
  "GOLD:small": { group: "AVALON_SMALL_ELITE", tiers: [6, 8] },
  "GOLD:large": { group: "AVALON_MEDIUM_ELITE", tiers: [6, 8] },
};
// Qué variante custodia el cofre no está en el dump: se unen las tres.
const VARIANTS = ["BASE", "CHAMPION", "BOSS"];

async function main() {
  const i = process.argv.indexOf("--sha");
  const sha = i >= 0 ? process.argv[i + 1] : await latestSha();
  const chests = JSON.parse(await cached(sha, "lootchests.json")).LootChests.LootChest as LootChestDef[];
  const lootTop = JSON.parse(await cached(sha, "loot.json"));
  const lootRoot = lootTop[Object.keys(lootTop).pop()!];
  const raw = Array.isArray(lootRoot.Lootlist) ? lootRoot.Lootlist : [lootRoot.Lootlist];
  const lists = new Map<string, LootList>(raw.map((l: LootList & { "@name": string }) => [l["@name"], l]));
  const byName = new Map(chests.map((c) => [c["@uniquename"], c]));
  const out: Record<string, { category: string; tiers: number[] }[]> = {};
  for (const [key, { group, tiers }] of Object.entries(GROUPS)) {
    const defs = VARIANTS.map((v) => byName.get(`${group}_${v}`)).filter((d): d is LootChestDef => !!d);
    if (defs.length !== VARIANTS.length) throw new Error(`faltan definiciones para ${group}`);
    for (const tier of tiers) {
      const cats = resolveChestCategories(defs, lists, tier);
      if (cats.length === 0) throw new Error(`sin botín para ${group} T${tier}`);
      out[`${key}:${tier}`] = cats;
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`[chest-loot] ${Object.keys(out).length} combinaciones → ${path.relative(process.cwd(), OUT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
