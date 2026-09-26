// Caché de precios AODP (plan fase 2, Tarea 3): red que falla, fila conservada, sin ceros.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb } from "./setup";

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
let mp: typeof import("@/lib/market-prices");
beforeAll(async () => {
  db = await startTestDb();
  prisma = (await import("@/lib/prisma")).prisma;
  mp = await import("@/lib/market-prices");
}, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

const row = (item_id: string, city: string, sell: number, date: string, buy = 0, buyDate = "0001-01-01T00:00:00") =>
  ({ item_id, city, quality: 1, sell_price_min: sell, sell_price_min_date: date, buy_price_max: buy, buy_price_max_date: buyDate });
const fetchWith = (handler: (url: string) => unknown) => (async (input: RequestInfo | URL) => {
  const url = String(input);
  const body = handler(url);
  if (body instanceof Error) throw body;
  if (typeof body === "number") return new Response("upstream", { status: body });
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

describe("refreshPrices", () => {
  it("guarda por servidor y ciudad, y convierte 0/0001-01-01 en NULL (nunca un cero)", async () => {
    const now = new Date("2026-09-26T13:00:00Z");
    const r = await mp.refreshPrices({ now, servers: ["europe"], fetchImpl: fetchWith((u) => u.includes("europe.") ? [
      row("T4_ORE", "Lymhurst", 100, "2026-09-26T12:00:00", 84, "2026-09-26T11:00:00"),
      row("T4_ORE", "Caerleon", 0, "0001-01-01T00:00:00"),
      row("T5_ROCK", "Martlock", 0, "0001-01-01T00:00:00", 70, "2026-09-26T10:00:00"),
    ] : []) });
    expect(r).toEqual([{ server: "europe", rows: 2 }]);
    const { fetchedAt, prices } = await mp.getPrices("europe", ["T4_ORE", "T5_ROCK"]);
    expect(fetchedAt).toBe(now.toISOString());
    expect(prices.T4_ORE.Lymhurst).toEqual({ sellMin: 100, sellMinAt: "2026-09-26T12:00:00.000Z", buyMax: 84, buyMaxAt: "2026-09-26T11:00:00.000Z" });
    expect(prices.T4_ORE.Caerleon).toBeUndefined();
    expect(prices.T5_ROCK.Martlock).toEqual({ sellMin: null, sellMinAt: null, buyMax: 70, buyMaxAt: "2026-09-26T10:00:00.000Z" });
  });

  it("si AODP falla (red o 5xx) se conserva lo anterior con su fecha y se informa del error", async () => {
    const t1 = new Date("2026-09-26T13:00:00Z");
    await mp.refreshPrices({ now: t1, servers: ["west"], fetchImpl: fetchWith(() => [row("T6_FIBER", "Thetford", 500, "2026-09-26T12:30:00")]) });
    const r = await mp.refreshPrices({ now: new Date("2026-09-26T14:00:00Z"), servers: ["west", "east"], fetchImpl: fetchWith((u) => u.includes("west.") ? 503 : new Error("ECONNRESET")) });
    expect(r.map((x) => [x.server, x.rows, Boolean(x.error)])).toEqual([["west", 0, true], ["east", 0, true]]);
    const { fetchedAt, prices } = await mp.getPrices("west", ["T6_FIBER"]);
    expect(fetchedAt).toBe(t1.toISOString());
    expect(prices.T6_FIBER.Thetford.sellMin).toBe(500);
  });

  it("un refresco parcial actualiza solo lo recibido; getPrices de un servidor vacío devuelve fetchedAt null", async () => {
    await mp.refreshPrices({ now: new Date("2026-09-26T15:00:00Z"), servers: ["west"], fetchImpl: fetchWith(() => [row("T6_FIBER", "Thetford", 520, "2026-09-26T14:50:00")]) });
    expect((await mp.getPrices("west", ["T6_FIBER"])).prices.T6_FIBER.Thetford.sellMin).toBe(520);
    expect(await mp.getPrices("east", ["T6_FIBER"])).toEqual({ fetchedAt: null, prices: {} });
  });
});

describe("GET /api/v1/zones/{name}/prices", () => {
  it("devuelve las líneas de la zona para el servidor pedido y valida server/enchant", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/prices/route");
    await mp.refreshPrices({ now: new Date("2026-09-26T16:00:00Z"), servers: ["europe"], fetchImpl: fetchWith(() => [row("T6_FIBER", "Lymhurst", 900, "2026-09-26T15:50:00", 700, "2026-09-26T15:50:00")]) });
    const call = (q: string, name = "casitos-atinaum") => GET(new Request(`http://t/x${q}`, { headers: { "x-forwarded-for": "10.3.3.3" } }), { params: Promise.resolve({ name }) });
    const r = await call("?server=europe");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("s-maxage=3600");
    const j = await r.json();
    expect(j.server).toBe("europe"); expect(j.enchant).toBe(0); expect(j.fetchedAt).toBe("2026-09-26T16:00:00.000Z");
    expect(j.lines.find((l: { itemId: string }) => l.itemId === "T6_FIBER").cities.Lymhurst.sellMin).toBe(900);
    expect((await call("")).status).toBe(200);                 // servidor por defecto: europe
    expect((await call("?server=mars")).status).toBe(400);
    expect((await call("?enchant=9")).status).toBe(400);
    expect((await call("?server=east", "nope")).status).toBe(404);
  });
});
