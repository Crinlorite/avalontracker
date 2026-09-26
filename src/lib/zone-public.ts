// Forma pública (JSON) de las zonas para /api/v1/zones. Solo datos del dump.
import crypto from "node:crypto";
import { AVALON_ZONES, ZONES_SOURCE, zoneSlug, zoneFamily, zoneSummaries, chestLootCategories, type AvalonZone } from "@/lib/avalon-zones";

const SITE = "https://avalontracker.app";

export function zoneIndexPayload() {
  return {
    source: { commit: ZONES_SOURCE.commit, dump: "ao-data/ao-bin-dumps" },
    zones: zoneSummaries().map((s) => ({ name: s.n, slug: s.s, tier: s.t, family: s.f, hideout: s.h, resources: s.r, chests: s.c, dungeons: s.d })),
  };
}

let indexEtag: string | null = null;
export function zoneIndexEtag(): string {
  indexEtag ??= `"${crypto.createHash("sha256").update(JSON.stringify(zoneIndexPayload())).digest("hex").slice(0, 32)}"`;
  return indexEtag;
}

export function zoneDetailPayload(z: AvalonZone) {
  const slug = zoneSlug(z.name);
  return {
    name: z.name, slug, tier: z.tier, family: zoneFamily(z.zoneClass), zoneClass: z.zoneClass, hideout: z.hasHideout,
    resources: z.resources, nodes: z.nodes,
    chests: z.chests.map((c) => ({ ...c, loot: chestLootCategories(c.type, c.size, c.tier) })),
    dungeons: z.dungeons, mobs: z.mobs, map: z.map,
    source: { commit: ZONES_SOURCE.commit, dump: "ao-data/ao-bin-dumps" },
    links: { web: `${SITE}/zones/${slug}`, prices: `${SITE}/api/v1/zones/${slug}/prices` },
  };
}

export const zoneCount = () => AVALON_ZONES.length;
