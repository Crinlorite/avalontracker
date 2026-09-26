// Qué líneas de precio enseña una zona: un recurso por tier de nodo (≥ T4),
// con el encantamiento elegido. Puro (sin BD): lo importa el cliente.
import type { AvalonZone, ResourceType } from "@/lib/avalon-zones";
import { resourceItemId } from "@/lib/aodp";
import type { PriceCell } from "@/lib/market-prices";

// Solo tipos de avalon-zones: importar un valor arrastraría las 400 zonas
// al bundle del cliente (ZonePrices es un componente cliente).
const RESOURCE_ORDER: ResourceType[] = ["ORE", "WOOD", "FIBER", "HIDE", "STONE"];

export type Enchant = 0 | 1 | 2 | 3;
export const ENCHANTS: Enchant[] = [0, 1, 2, 3];
export const ROYAL_FORGE_ITEM = (itemId: string) => `https://royalforge.app/market/item/${itemId}`;

export function zoneResourceTiers(z: AvalonZone): { resource: ResourceType; tier: number }[] {
  const out: { resource: ResourceType; tier: number }[] = [];
  for (const resource of RESOURCE_ORDER) {
    const tiers = new Set(z.nodes.filter((n) => n.type === resource && n.tier >= 4).map((n) => n.tier));
    // Sin nodos con tier (dato ausente en el dump): el tier de la zona.
    if (tiers.size === 0 && z.nodes.length === 0 && z.resources.some((r) => r.type === resource) && z.tier >= 4) tiers.add(z.tier);
    for (const tier of [...tiers].sort((a, b) => b - a)) out.push({ resource, tier });
  }
  return out;
}

export type PriceLine = { itemId: string; resource: ResourceType; tier: number; enchant: Enchant; royalForge: string; cities: Record<string, PriceCell> };

export function priceLinesForZone(z: AvalonZone, prices: Record<string, Record<string, PriceCell>>, enchant: Enchant): PriceLine[] {
  return zoneResourceTiers(z).map(({ resource, tier }) => {
    const itemId = resourceItemId(resource, tier, enchant);
    return { itemId, resource, tier, enchant, royalForge: ROYAL_FORGE_ITEM(itemId), cities: prices[itemId] ?? {} };
  });
}

export function bestCity(line: PriceLine, field: "sellMin" | "buyMax"): { city: string; value: number } | null {
  let best: { city: string; value: number } | null = null;
  for (const [city, cell] of Object.entries(line.cities)) {
    const v = cell[field];
    if (v !== null && (!best || v > best.value)) best = { city, value: v };
  }
  return best;
}
