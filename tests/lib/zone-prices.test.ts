// Líneas de precio de una zona (plan fase 2, Tarea 4): tiers de nodo, ids, mejor ciudad.
import { describe, it, expect } from "vitest";
import { zoneResourceTiers, priceLinesForZone, bestCity } from "@/lib/zone-prices";
import { AVALON_ZONES, type AvalonZone } from "@/lib/avalon-zones";

const casitos = AVALON_ZONES.find((z) => z.name === "Casitos-Atinaum")!;

describe("zoneResourceTiers", () => {
  it("nodos ≥ T4 sin repetir, recurso y tier descendente; ignora nodos T1–T3", () => {
    expect(zoneResourceTiers(casitos)).toEqual([
      { resource: "FIBER", tier: 7 }, { resource: "FIBER", tier: 6 }, { resource: "FIBER", tier: 5 },
      { resource: "HIDE", tier: 6 }, { resource: "HIDE", tier: 5 },
    ]);
  });
  it("zona con recursos pero sin nodos con tier usa el tier de la zona", () => {
    const z: AvalonZone = { ...casitos, nodes: [], resources: [{ type: "ORE", size: "large", count: 1 }] };
    expect(zoneResourceTiers(z)).toEqual([{ resource: "ORE", tier: 6 }]);
  });
  it("zona sin recolección → sin líneas", () => {
    expect(zoneResourceTiers({ ...casitos, nodes: [], resources: [] })).toEqual([]);
  });
});

describe("priceLinesForZone / bestCity", () => {
  const prices = { "T6_FIBER_LEVEL1@1": { Lymhurst: { sellMin: 900, sellMinAt: "2026-09-26T12:00:00.000Z", buyMax: 700, buyMaxAt: "2026-09-26T12:00:00.000Z" }, Caerleon: { sellMin: 1200, sellMinAt: "2026-09-26T09:00:00.000Z", buyMax: null, buyMaxAt: null } } };
  it("una línea por recurso y tier con el id encantado, enlace a Royal Forge y ciudades", () => {
    const lines = priceLinesForZone({ ...casitos, nodes: [{ type: "FIBER", tier: 6, count: 1 }] }, prices, 1);
    expect(lines).toEqual([{ itemId: "T6_FIBER_LEVEL1@1", resource: "FIBER", tier: 6, enchant: 1, royalForge: "https://royalforge.app/market/item/T6_FIBER_LEVEL1@1", cities: prices["T6_FIBER_LEVEL1@1"] }]);
    expect(bestCity(lines[0], "sellMin")).toEqual({ city: "Caerleon", value: 1200 });
    expect(bestCity(lines[0], "buyMax")).toEqual({ city: "Lymhurst", value: 700 });
  });
  it("sin precios cacheados: la línea existe con cities vacío y bestCity null", () => {
    const [line] = priceLinesForZone({ ...casitos, nodes: [{ type: "HIDE", tier: 5, count: 1 }] }, {}, 0);
    expect(line.cities).toEqual({});
    expect(bestCity(line, "sellMin")).toBeNull();
  });
});
