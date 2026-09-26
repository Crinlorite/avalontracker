// Categorías de botín por cofre desde lootchests.json y loot.json (plan fase 2, Tarea 2).
import { describe, it, expect } from "vitest";
import { categorizeLootRef, resolveChestCategories } from "@/lib/loot-categories";

describe("categorizeLootRef", () => {
  it("mapea las referencias del dump a categorías", () => {
    expect(categorizeLootRef("T6_DIRECTLOOTDROP_WHITE")).toBe("gear");
    expect(categorizeLootRef("LOOT_AVALON_ARTEFACTS")).toBe("artefacts");
    // Verificado en el dump: FRAGMENT_LOOT* = runas/almas/reliquias; solo
    // LOOT_AVALON_FRAGMENTS trae esquirlas avalonianas (revisión final, crítico 1).
    expect(categorizeLootRef("LOOT_AVALON_FRAGMENTS")).toBe("shards");
    expect(categorizeLootRef("FRAGMENT_LOOT")).toBe("materials");
    expect(categorizeLootRef("FRAGMENT_LOOT_100X")).toBe("materials");
    expect(categorizeLootRef("FAME_BOOKS_LOOT_CHESTS")).toBe("fame_books");
    expect(categorizeLootRef("TREASURES_ROAD_CHEST_LOOT")).toBe("treasures");
    expect(categorizeLootRef("T6_LOOT_RD_TOKEN")).toBe("tokens");
    expect(categorizeLootRef("T4_LOOT_EXPEDITION_TOKEN")).toBe("tokens");
    expect(categorizeLootRef("T4_SILVERBAG_NONTRADABLE")).toBe("silver");
    expect(categorizeLootRef("ALGO_QUE_NO_CONOZCO")).toBeNull();
  });
});

describe("resolveChestCategories", () => {
  const lists = new Map([
    ["L6", { Item: [{ "@type": "T1_SILVERBAG_NONTRADABLE", "@chance": "4" }], LootListReference: [{ "@name": "T6_DIRECTLOOTDROP_WHITE", "@chance": "3" }, { "@name": "T7_DIRECTLOOTDROP_WHITE", "@chance": "0.5" }, { "@name": "LOOT_AVALON_ARTEFACTS", "@chance": "0.01" }] }],
    ["L6C", { Item: [], LootListReference: [{ "@name": "FAME_BOOKS_LOOT_CHESTS", "@chance": "10" }] }],
  ]);
  const chests = [
    { "@uniquename": "X_BASE", RareStates: { RareState: [{ "@state": "standard", "@weight": "6", Loot: { LootByTier: [{ "@tier": "6", LootListReference: [{ "@name": "L6" }] }] } }] } },
    { "@uniquename": "X_CHAMPION", RareStates: { RareState: [{ "@state": "standard", "@weight": "1", Loot: { LootByTier: [{ "@tier": "6", LootListReference: [{ "@name": "L6C" }] }] } }] } },
  ];
  it("ordena por peso acumulado (peso del estado × chance) y agrupa tiers del equipo", () => {
    expect(resolveChestCategories(chests, lists, 6)).toEqual([
      { category: "silver", tiers: [] },        // 6 × 4 = 24
      { category: "gear", tiers: [6, 7] },       // 6 × 3.5 = 21
      { category: "fame_books", tiers: [] },     // 1 × 10 = 10
      { category: "artefacts", tiers: [] },      // 6 × 0.01
    ]);
  });
  it("un estado sin peso (@weight ausente) cuenta como 1, no se descarta", () => {
    const solo = [{ "@uniquename": "Y", RareStates: { RareState: { "@state": "standard", Loot: { LootByTier: { "@tier": "6", LootListReference: { "@name": "L6C" } } } } } }];
    expect(resolveChestCategories(solo, lists, 6)).toEqual([{ category: "fame_books", tiers: [] }]);
  });
  it("un tier sin tabla devuelve vacío en vez de romper", () => {
    expect(resolveChestCategories(chests, lists, 8)).toEqual([]);
  });
});
