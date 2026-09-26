// Albion Online Data Project (AODP): ids, URLs y parseo. Sin red ni BD
// (eso vive en market-prices.ts). Límites de AODP: 180 peticiones/min,
// 300/5 min, URL ≤ 4096 caracteres.
import type { ResourceType } from "@/lib/avalon-zones";

export type GameServer = "west" | "europe" | "east";
export const GAME_SERVERS: GameServer[] = ["west", "europe", "east"];
export const DEFAULT_SERVER: GameServer = "europe";
export const MARKET_CITIES = ["Lymhurst", "Martlock", "Thetford", "Bridgewatch", "Fort Sterling", "Caerleon", "Brecilien"] as const;
export const USER_AGENT = "AvalonTracker/2 (+https://avalontracker.app)";

const ITEM_RES: Record<ResourceType, string> = { ORE: "ORE", WOOD: "WOOD", FIBER: "FIBER", HIDE: "HIDE", STONE: "ROCK" };

export function resourceItemId(resource: ResourceType, tier: number, enchant: 0 | 1 | 2 | 3): string {
  const base = `T${tier}_${ITEM_RES[resource]}`;
  return enchant ? `${base}_LEVEL${enchant}@${enchant}` : base;
}

export const RESOURCE_ITEM_IDS: string[] = (["ORE", "WOOD", "FIBER", "HIDE", "STONE"] as ResourceType[]).flatMap((r) =>
  [4, 5, 6, 7, 8].flatMap((t) => ([0, 1, 2, 3] as const).map((e) => resourceItemId(r, t, e))),
);

export function aodpUrl(server: GameServer, ids: string[], cities: readonly string[] = MARKET_CITIES): string {
  return `https://${server}.albion-online-data.com/api/v2/stats/prices/${ids.join(",")}?locations=${cities.map(encodeURIComponent).join(",")}&qualities=1`;
}

// Lotes de ids cuya URL (con las ciudades) se queda por debajo de maxUrl.
export function chunkIds(ids: string[], maxUrl = 3800): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const id of ids) {
    if (cur.length && aodpUrl("europe", [...cur, id]).length > maxUrl) { out.push(cur); cur = []; }
    cur.push(id);
  }
  if (cur.length) out.push(cur);
  return out;
}

export type ParsedPrice = { itemId: string; city: string; sellMin: number | null; sellMinAt: Date | null; buyMax: number | null; buyMaxAt: Date | null };

// AODP marca «sin dato» con precio 0 y fecha 0001-01-01. Las fechas vienen
// sin zona y son UTC.
function priceAt(price: unknown, date: unknown): [number | null, Date | null] {
  if (typeof price !== "number" || price <= 0 || typeof date !== "string" || date.startsWith("0001-")) return [null, null];
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(date) ? date : `${date}Z`);
  return Number.isNaN(d.getTime()) ? [null, null] : [Math.round(price), d];
}

export function parsePrices(json: unknown): ParsedPrice[] {
  if (!Array.isArray(json)) return [];
  const out: ParsedPrice[] = [];
  for (const r of json) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.item_id !== "string" || typeof o.city !== "string") continue;
    const [sellMin, sellMinAt] = priceAt(o.sell_price_min, o.sell_price_min_date);
    const [buyMax, buyMaxAt] = priceAt(o.buy_price_max, o.buy_price_max_date);
    // Una fila con todo a null es AODP diciendo «ya no hay dato»: se devuelve
    // para que el refresco borre la celda vieja.
    out.push({ itemId: o.item_id, city: o.city, sellMin, sellMinAt, buyMax, buyMaxAt });
  }
  return out;
}
