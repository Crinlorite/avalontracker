// Bichos de una zona de Avalon, a partir de `mobcounts` de world.json.
import type { ResourceType } from "@/lib/avalon-zones";
import type { PublicKey, PublicT } from "@/i18n/public";

export type ZoneMob =
  | { kind: "critter"; resource: ResourceType; tier: number; rank: "veteran" | "elite"; count: number }
  | { kind: "animal"; name: "bear" | "boar" | "direwolf" | "wolpertinger" | "direboar" | "direbear"; tier: number | null; count: number }
  | { kind: "miniguardian" | "guardian"; name: "basilisk" | "dryad" | "ent" | "oregiant" | "rockgiant"; tier: number; count: number }
  | { kind: "other"; name: string; count: number };

const RES: Record<string, ResourceType> = { ORE: "ORE", WOOD: "WOOD", FIBER: "FIBER", HIDE: "HIDE", ROCK: "STONE" };
const ANIMALS: Record<string, Extract<ZoneMob, { kind: "animal" }>["name"]> = {
  BEAR: "bear", BOAR: "boar", DIREWOLF: "direwolf", WOLPERTINGER: "wolpertinger", DIREBOAR: "direboar", DIREBEAR: "direbear",
};
const GUARDIANS = new Set(["BASILISK", "DRYAD", "ENT", "OREGIANT", "ROCKGIANT"]);

export function classifyMob(name: string, count: number): ZoneMob {
  let m = /^T(\d)_MOB_CRITTER_(ORE|WOOD|FIBER|ROCK|HIDE)_(?:ROADS|MISTCOUGAR)_(VETERAN|ELITE)$/.exec(name);
  if (m) return { kind: "critter", resource: RES[m[2]], tier: Number(m[1]), rank: m[3] === "ELITE" ? "elite" : "veteran", count };
  m = /^T(\d)_MOB_(?:MINIGUARDIAN_ROADS|GUARDIAN_FOREST)_([A-Z]+)$/.exec(name);
  if (m && GUARDIANS.has(m[2])) {
    return { kind: name.includes("MINIGUARDIAN") ? "miniguardian" : "guardian", name: m[2].toLowerCase() as "basilisk" | "dryad" | "ent" | "oregiant" | "rockgiant", tier: Number(m[1]), count };
  }
  m = /^(?:T(\d)_)?MOB_(?:HIDE_(?:MISTS|FOREST)_)?([A-Z]+?)(?:_SMALL)?$/.exec(name);
  if (m && ANIMALS[m[2]]) return { kind: "animal", name: ANIMALS[m[2]], tier: m[1] ? Number(m[1]) : null, count };
  return { kind: "other", name, count };
}

const KIND_ORDER: Record<ZoneMob["kind"], number> = { critter: 0, guardian: 1, miniguardian: 2, animal: 3, other: 4 };
const RES_ORDER = ["ORE", "WOOD", "FIBER", "HIDE", "STONE"];

// Etiqueta de un bicho en el idioma de la página pública.
export function mobLabel(m: ZoneMob, t: PublicT): string {
  switch (m.kind) {
    case "critter": return t("mob.critter", { tier: m.tier, res: t(`res.${m.resource}` as PublicKey), rank: t(`mob.rank.${m.rank}` as PublicKey) });
    case "animal": { const n = t(`mob.animal.${m.name}` as PublicKey); return m.tier ? `${n} T${m.tier}` : n; }
    case "guardian": return t("mob.guardian", { name: t(`mob.guardian.${m.name}` as PublicKey), tier: m.tier });
    case "miniguardian": return t("mob.miniguardian", { name: t(`mob.guardian.${m.name}` as PublicKey), tier: m.tier });
    default: return m.name;
  }
}

// Critters (por recurso, tier alto primero), guardianes, miniguardianes,
// animales y, al final, lo desconocido.
export function sortMobs(mobs: ZoneMob[]): ZoneMob[] {
  const key = (m: ZoneMob) => m.kind === "critter" ? [RES_ORDER.indexOf(m.resource), 9 - m.tier, m.rank] : "name" in m ? [0, 0, m.name] : [0, 0, ""];
  return [...mobs].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || String(key(a)).localeCompare(String(key(b))));
}

// Agrupa las entradas repetidas de mobcounts (mismo bicho en varios puntos)
// y suma sus cantidades. Lo desconocido se conserva con su nombre crudo.
export function classifyMobs(raw: { "@name": string; "@count": string }[]): ZoneMob[] {
  const acc = new Map<string, ZoneMob>();
  for (const r of raw) {
    const mob = classifyMob(r["@name"], Number(r["@count"]) || 0);
    const key = JSON.stringify({ ...mob, count: 0 });
    const prev = acc.get(key);
    if (prev) prev.count += mob.count;
    else acc.set(key, mob);
  }
  return [...acc.values()];
}
