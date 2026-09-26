// Carga de precios de una zona desde la caché (servidor). Separado de
// zone-prices.ts para que el componente cliente no importe Prisma.
import type { AvalonZone } from "@/lib/avalon-zones";
import { MARKET_CITIES, resourceItemId, type GameServer } from "@/lib/aodp";
import { getPrices } from "@/lib/market-prices";
import { priceLinesForZone, zoneResourceTiers, type Enchant } from "@/lib/zone-prices";

export async function zonePricesPayload(z: AvalonZone, server: GameServer, enchant: Enchant) {
  const ids = zoneResourceTiers(z).map(({ resource, tier }) => resourceItemId(resource, tier, enchant));
  const { fetchedAt, prices } = await getPrices(server, ids);
  return { zone: z.name, server, enchant, fetchedAt, cities: [...MARKET_CITIES], lines: priceLinesForZone(z, prices, enchant) };
}
