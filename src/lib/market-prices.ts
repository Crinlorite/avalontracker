// Refresco horario de precios desde AODP y lectura desde Postgres. Cero
// peticiones a AODP por visita: la ficha y la API solo leen la tabla.
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { GAME_SERVERS, RESOURCE_ITEM_IDS, USER_AGENT, aodpUrl, chunkIds, parsePrices, type GameServer } from "@/lib/aodp";

export type PriceCell = { sellMin: number | null; sellMinAt: string | null; buyMax: number | null; buyMaxAt: string | null };
export type RefreshResult = { server: GameServer; rows: number; removed: number; error?: string };

export async function refreshPrices(opts: { fetchImpl?: typeof fetch; servers?: GameServer[]; now?: Date; ids?: string[] } = {}): Promise<RefreshResult[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const results: RefreshResult[] = [];
  for (const server of opts.servers ?? GAME_SERVERS) {
    let rows = 0;
    let removed = 0;
    try {
      for (const ids of chunkIds(opts.ids ?? RESOURCE_ITEM_IDS)) {
        const res = await fetchImpl(aodpUrl(server, ids), { headers: { "user-agent": USER_AGENT, "accept-encoding": "gzip", accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`AODP ${server} HTTP ${res.status}`);
        const parsed = parsePrices(await res.json());
        if (parsed.length === 0) logger.warn({ server, ids: ids.length }, "aodp batch returned no rows");
        // Un lote que llega bien es la verdad de AODP: lo que trae precio se
        // pisa; lo que AODP marca «sin dato» (0 / 0001-01-01) se borra, para no
        // enseñar un precio viejo bajo la fecha de descarga de hoy. Si el lote
        // falla, lo anterior sigue con su fecha (catch de abajo).
        const present = parsed.filter((p) => p.sellMin !== null || p.buyMax !== null);
        const gone = parsed.filter((p) => p.sellMin === null && p.buyMax === null);
        const out = await prisma.$transaction([
          ...present.map((p) => prisma.marketPrice.upsert({
            where: { server_itemId_city: { server, itemId: p.itemId, city: p.city } },
            create: { server, itemId: p.itemId, city: p.city, sellMin: p.sellMin, sellMinAt: p.sellMinAt, buyMax: p.buyMax, buyMaxAt: p.buyMaxAt, fetchedAt: now },
            update: { sellMin: p.sellMin, sellMinAt: p.sellMinAt, buyMax: p.buyMax, buyMaxAt: p.buyMaxAt, fetchedAt: now },
          })),
          ...(gone.length ? [prisma.marketPrice.deleteMany({ where: { server, OR: gone.map((g) => ({ itemId: g.itemId, city: g.city })) } })] : []),
        ]);
        rows += present.length;
        if (gone.length) removed += (out[out.length - 1] as { count: number }).count;
      }
      results.push({ server, rows, removed });
    } catch (err) {
      results.push({ server, rows, removed, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// `fetchedAt` es la última descarga del servidor (aunque estos ids no tengan
// filas): «descargado, sin dato» no es «nunca descargado».
export async function getPrices(server: GameServer, itemIds: string[]): Promise<{ fetchedAt: string | null; prices: Record<string, Record<string, PriceCell>> }> {
  const prices: Record<string, Record<string, PriceCell>> = {};
  const [last, rows] = await Promise.all([
    prisma.marketPrice.aggregate({ _max: { fetchedAt: true }, where: { server } }),
    itemIds.length === 0 ? Promise.resolve([]) : prisma.marketPrice.findMany({ where: { server, itemId: { in: itemIds } } }),
  ]);
  for (const r of rows) {
    (prices[r.itemId] ??= {})[r.city] = { sellMin: r.sellMin, sellMinAt: r.sellMinAt?.toISOString() ?? null, buyMax: r.buyMax, buyMaxAt: r.buyMaxAt?.toISOString() ?? null };
  }
  return { fetchedAt: last._max.fetchedAt?.toISOString() ?? null, prices };
}

// Para la tarea de fondo: registra el resultado sin tirar el proceso.
export async function refreshPricesJob() {
  const r = await refreshPrices();
  for (const x of r) (x.error ? logger.warn : logger.info).call(logger, { server: x.server, rows: x.rows, removed: x.removed, error: x.error }, "aodp prices refresh");
}
