import { publicApiGuard, publicJson, publicNotFound, publicBadRequest, publicOptions, publicInternalError } from "@/lib/public-api";
import { zoneBySlug } from "@/lib/avalon-zones";
import { DEFAULT_SERVER, GAME_SERVERS, type GameServer } from "@/lib/aodp";
import { ENCHANTS, type Enchant } from "@/lib/zone-prices";
import { zonePricesPayload } from "@/lib/zone-prices-db";

// Precios (caché de AODP) de los recursos de una zona: ?server=west|europe|east
// (por defecto europe) y ?enchant=0..3. Nunca llama a AODP (spec §7).
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const blocked = publicApiGuard(req);
  if (blocked) return blocked;
  const z = zoneBySlug((await params).name);
  if (!z) return publicNotFound("Zona desconocida");
  const q = new URL(req.url).searchParams;
  const server = (q.get("server") ?? DEFAULT_SERVER) as GameServer;
  if (!GAME_SERVERS.includes(server)) return publicBadRequest("server debe ser west, europe o east");
  const enchant = Number(q.get("enchant") ?? 0) as Enchant;
  if (!ENCHANTS.includes(enchant)) return publicBadRequest("enchant debe ser 0, 1, 2 o 3");
  try {
    // Caché de 10 min en CDN: los precios cambian cada hora.
    return publicJson(await zonePricesPayload(z, server, enchant), { req, maxAge: 600 });
  } catch (err) { return publicInternalError(err); }
}

export function OPTIONS() {
  return publicOptions();
}
