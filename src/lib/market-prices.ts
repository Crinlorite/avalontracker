// Refresco horario de precios desde AODP y lectura desde Postgres. Cero
// peticiones a AODP por visita: la ficha y la API solo leen la tabla.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { GAME_SERVERS, RESOURCE_ITEM_IDS, USER_AGENT, aodpUrl, chunkIds, parsePrices, type GameServer } from "@/lib/aodp";

export type PriceCell = { sellMin: number | null; sellMinAt: string | null; buyMax: number | null; buyMaxAt: string | null };

export async function refreshPrices(opts: { fetchImpl?: typeof fetch; servers?: GameServer[]; now?: Date; ids?: string[] } = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const results: { server: GameServer; rows: number; error?: string }[] = [];
  for (const server of opts.servers ?? GAME_SERVERS) {
    let rows = 0;
    try {
      for (const ids of chunkIds(opts.ids ?? RESOURCE_ITEM_IDS)) {
        const res = await fetchImpl(aodpUrl(server, ids), { headers: { "user-agent": USER_AGENT, "accept-encoding": "gzip", accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`AODP ${server} HTTP ${res.status}`);
        const parsed = parsePrices(await res.json());
        // Solo se pisa lo que llega: si un lote falla, lo anterior sigue con su fecha.
        await prisma.$transaction(parsed.map((p) => prisma.marketPrice.upsert({
          where: { server_itemId_city: { server, itemId: p.itemId, city: p.city } },
          create: { server, itemId: p.itemId, city: p.city, sellMin: p.sellMin, sellMinAt: p.sellMinAt, buyMax: p.buyMax, buyMaxAt: p.buyMaxAt, fetchedAt: now },
          update: { sellMin: p.sellMin, sellMinAt: p.sellMinAt, buyMax: p.buyMax, buyMaxAt: p.buyMaxAt, fetchedAt: now },
        })));
        rows += parsed.length;
      }
      results.push({ server, rows });
    } catch (err) {
      results.push({ server, rows, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export async function getPrices(server: GameServer, itemIds: string[]): Promise<{ fetchedAt: string | null; prices: Record<string, Record<string, PriceCell>> }> {
  if (itemIds.length === 0) return { fetchedAt: null, prices: {} };
  const rows = await prisma.marketPrice.findMany({ where: { server, itemId: { in: itemIds } } });
  const prices: Record<string, Record<string, PriceCell>> = {};
  let latest: Date | null = null;
  for (const r of rows) {
    (prices[r.itemId] ??= {})[r.city] = { sellMin: r.sellMin, sellMinAt: r.sellMinAt?.toISOString() ?? null, buyMax: r.buyMax, buyMaxAt: r.buyMaxAt?.toISOString() ?? null };
    if (!latest || r.fetchedAt > latest) latest = r.fetchedAt;
  }
  return { fetchedAt: latest?.toISOString() ?? null, prices };
}

// Para la tarea de fondo: registra el resultado sin tirar el proceso.
export async function refreshPricesJob() {
  const r = await refreshPrices();
  for (const x of r) (x.error ? logger.warn : logger.info).call(logger, { server: x.server, rows: x.rows, error: x.error }, "aodp prices refresh");
}
