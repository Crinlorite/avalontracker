import zonesJson from "@/data/avalon-zones.json";
import source from "@/data/avalon-zones.source.json";
import chestLoot from "@/data/chest-loot.json";
import type { ZoneMob } from "@/lib/mobs";
import type { LootCategory } from "@/lib/loot-categories";

// Datos públicos de las 400 zonas de los Caminos de Avalon (ver
// src/data/README.md). Solo lectura: lo consumen /zones y /zones/<zona>.

export type ResourceType = "ORE" | "WOOD" | "FIBER" | "HIDE" | "STONE";
export type ChestType = "GREEN" | "BLUE" | "GOLD";
export type DungeonType = "DUNGEON_SOLO" | "DUNGEON_GROUP" | "DUNGEON_ELITE";
export type Size = "small" | "large";

export type AvalonZone = {
  name: string;
  clusterId: string;
  type: "AVALON";
  tier: number;
  zoneClass: string;
  hasHideout: boolean;
  resources: { type: ResourceType; size: Size; count: number }[];
  // El tier del cofre es el del punto de aparición (T4/T6/T8), no el de la zona.
  chests: { type: ChestType; size: Size; tier: number; count: number }[];
  dungeons: { type: DungeonType; size: Size; count: number }[];
  nodes: { type: ResourceType; tier: number; count: number }[];
  mobs: ZoneMob[];
  map: {
    min: [number, number];
    max: [number, number];
    markers: { kind: "resource" | "chest" | "dungeon"; type: string; size: Size; tier?: number; x: number; y: number }[];
  };
};

export const AVALON_ZONES = zonesJson as unknown as AvalonZone[];
export const ZONES_SOURCE = source as { source: string; commit: string; generatedAt: string };

// Familia de la clase del juego (`@type` del cluster). Solo agrupa los
// códigos tal y como vienen; la página enseña además el código crudo.
export type ZoneFamily = "royal" | "outlands" | "hideout" | "deep" | "standard";
export function zoneFamily(zoneClass: string): ZoneFamily {
  if (zoneClass.startsWith("TUNNEL_ROYAL")) return "royal";
  if (zoneClass.startsWith("TUNNEL_BLACK")) return "outlands";
  if (zoneClass.startsWith("TUNNEL_HIDEOUT")) return "hideout";
  if (zoneClass.startsWith("TUNNEL_DEEP")) return "deep";
  return "standard";
}

export const zoneSlug = (name: string) => name.toLowerCase();

const BY_SLUG = new Map(AVALON_ZONES.map((z) => [zoneSlug(z.name), z]));
export function zoneBySlug(slug: string): AvalonZone | undefined {
  return BY_SLUG.get(decodeURIComponent(slug).toLowerCase());
}

export const RESOURCE_TYPES: ResourceType[] = ["ORE", "WOOD", "FIBER", "HIDE", "STONE"];
export const CHEST_TYPES: ChestType[] = ["GOLD", "BLUE", "GREEN"];
export const DUNGEON_TYPES: DungeonType[] = ["DUNGEON_ELITE", "DUNGEON_GROUP", "DUNGEON_SOLO"];

const sum = (xs: { count: number }[]) => xs.reduce((a, x) => a + x.count, 0);

// Categorías de botín del cofre (tipo, tamaño, tier real del punto de
// aparición), generadas por scripts/extract-chest-loot.ts. Combinación sin
// tabla → [] y la ficha no inventa nada.
export function chestLootCategories(type: ChestType, size: Size, tier: number): { category: LootCategory; tiers: number[] }[] {
  const table = chestLoot as Record<string, { category: LootCategory; tiers: number[] }[]>;
  return table[`${type}:${size}:${tier}`] ?? [];
}

export function chestCount(z: AvalonZone, type?: ChestType): number {
  return sum(type ? z.chests.filter((c) => c.type === type) : z.chests);
}
export function dungeonCount(z: AvalonZone, type?: DungeonType): number {
  return sum(type ? z.dungeons.filter((d) => d.type === type) : z.dungeons);
}
export function resourceTypes(z: AvalonZone): ResourceType[] {
  return RESOURCE_TYPES.filter((r) => z.resources.some((x) => x.type === r));
}
// Tier máximo de nodo por tipo de recurso (distribución del juego).
export function maxNodeTier(z: AvalonZone, type: ResourceType): number | null {
  const tiers = z.nodes.filter((n) => n.type === type).map((n) => n.tier);
  return tiers.length ? Math.max(...tiers) : null;
}

// Resumen ligero para el buscador (se manda al cliente).
export type ZoneSummary = {
  n: string;
  s: string;
  t: number;
  f: ZoneFamily;
  h: boolean;
  r: ResourceType[];
  c: Record<ChestType, number>;
  d: Record<DungeonType, number>;
};
export function zoneSummaries(): ZoneSummary[] {
  return AVALON_ZONES.map((z) => ({
    n: z.name,
    s: zoneSlug(z.name),
    t: z.tier,
    f: zoneFamily(z.zoneClass),
    h: z.hasHideout,
    r: resourceTypes(z),
    c: { GOLD: chestCount(z, "GOLD"), BLUE: chestCount(z, "BLUE"), GREEN: chestCount(z, "GREEN") },
    d: {
      DUNGEON_ELITE: dungeonCount(z, "DUNGEON_ELITE"),
      DUNGEON_GROUP: dungeonCount(z, "DUNGEON_GROUP"),
      DUNGEON_SOLO: dungeonCount(z, "DUNGEON_SOLO"),
    },
  }));
}

// Zonas parecidas: mismo tier y máximo solape de recursos, desempate por
// cofres. Enlazado interno útil para quien busca «otra zona como esta».
export function similarZones(z: AvalonZone, n = 6): AvalonZone[] {
  const mine = new Set(resourceTypes(z));
  return AVALON_ZONES
    .filter((o) => o.name !== z.name && o.tier === z.tier)
    .map((o) => {
      const theirs = resourceTypes(o);
      const overlap = theirs.filter((r) => mine.has(r)).length;
      const union = new Set([...mine, ...theirs]).size || 1;
      return { o, score: overlap / union + (zoneFamily(o.zoneClass) === zoneFamily(z.zoneClass) ? 0.25 : 0) + chestCount(o, "GOLD") * 0.01 };
    })
    .sort((a, b) => b.score - a.score || a.o.name.localeCompare(b.o.name))
    .slice(0, n)
    .map((x) => x.o);
}
