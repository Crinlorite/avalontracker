// AODP: ids de recursos, lotes de URL y parseo de precios (plan fase 2, Tarea 3).
import { describe, it, expect } from "vitest";
import { resourceItemId, RESOURCE_ITEM_IDS, chunkIds, aodpUrl, parsePrices, MARKET_CITIES } from "@/lib/aodp";

describe("ids de recursos", () => {
  it("construye los ids de AODP con encantamiento y piedra → ROCK", () => {
    expect(resourceItemId("FIBER", 6, 0)).toBe("T6_FIBER");
    expect(resourceItemId("HIDE", 6, 2)).toBe("T6_HIDE_LEVEL2@2");
    expect(resourceItemId("STONE", 4, 0)).toBe("T4_ROCK");
    expect(resourceItemId("ORE", 8, 3)).toBe("T8_ORE_LEVEL3@3");
  });
  it("100 ids: 5 recursos × T4–T8 × .0–.3, sin repetidos", () => {
    expect(RESOURCE_ITEM_IDS).toHaveLength(100);
    expect(new Set(RESOURCE_ITEM_IDS).size).toBe(100);
    expect(RESOURCE_ITEM_IDS).toContain("T4_ORE");
    expect(RESOURCE_ITEM_IDS).toContain("T8_ROCK_LEVEL3@3");
  });
});

describe("lotes y URL", () => {
  it("ninguna URL supera los 4096 caracteres aunque haya 400 ids", () => {
    const many = Array.from({ length: 400 }, (_, i) => `T8_ITEM_LEVEL3@3_${i}`);
    const chunks = chunkIds(many);
    expect(chunks.flat()).toEqual(many);
    for (const c of chunks) expect(aodpUrl("europe", c).length).toBeLessThan(4096);
  });
  it("URL con servidor, ids, ciudades y calidad 1", () => {
    const u = aodpUrl("west", ["T4_ORE", "T4_ORE_LEVEL1@1"]);
    expect(u).toBe(`https://west.albion-online-data.com/api/v2/stats/prices/T4_ORE,T4_ORE_LEVEL1@1?locations=${MARKET_CITIES.map(encodeURIComponent).join(",")}&qualities=1`);
  });
});

describe("parsePrices", () => {
  it("0001-01-01 y precio 0 = sin dato; fechas UTC; filas sin nada se descartan", () => {
    const rows = parsePrices([
      { item_id: "T4_ORE", city: "Lymhurst", quality: 1, sell_price_min: 100, sell_price_min_date: "2026-09-26T12:00:00", buy_price_max: 84, buy_price_max_date: "2026-09-26T11:15:00" },
      { item_id: "T4_ORE", city: "Caerleon", quality: 1, sell_price_min: 0, sell_price_min_date: "0001-01-01T00:00:00", buy_price_max: 0, buy_price_max_date: "0001-01-01T00:00:00" },
      { item_id: "T4_ORE", city: "Martlock", quality: 1, sell_price_min: 0, sell_price_min_date: "0001-01-01T00:00:00", buy_price_max: 70, buy_price_max_date: "2026-09-26T10:00:00" },
    ]);
    expect(rows).toEqual([
      { itemId: "T4_ORE", city: "Lymhurst", sellMin: 100, sellMinAt: new Date("2026-09-26T12:00:00Z"), buyMax: 84, buyMaxAt: new Date("2026-09-26T11:15:00Z") },
      { itemId: "T4_ORE", city: "Martlock", sellMin: null, sellMinAt: null, buyMax: 70, buyMaxAt: new Date("2026-09-26T10:00:00Z") },
    ]);
  });
  it("basura → lista vacía, nunca excepción", () => {
    expect(parsePrices(null)).toEqual([]);
    expect(parsePrices({ error: "x" })).toEqual([]);
    expect(parsePrices([{ item_id: 5 }])).toEqual([]);
  });
});
