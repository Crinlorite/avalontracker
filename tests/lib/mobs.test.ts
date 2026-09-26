// Bichos por zona de Avalon desde mobcounts del dump (plan fase 2, Tarea 1).
import { describe, it, expect } from "vitest";
import { classifyMob, classifyMobs, mobLabel, sortMobs } from "@/lib/mobs";
import { publicT } from "@/i18n/public";

describe("mobLabel / sortMobs", () => {
  it("etiquetas en inglés y en castellano", () => {
    const en = publicT("en"); const es = publicT("es");
    expect(mobLabel({ kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 1 }, en)).toBe("T5 Ore critters (veteran)");
    expect(mobLabel({ kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 1 }, es)).toBe("Bichos de Mineral T5 (veteranos)");
    expect(mobLabel({ kind: "guardian", name: "ent", tier: 8, count: 1 }, en)).toBe("Ent guardian T8");
    expect(mobLabel({ kind: "animal", name: "bear", tier: null, count: 2 }, en)).toBe("Bear");
    expect(mobLabel({ kind: "animal", name: "direboar", tier: 7, count: 2 }, en)).toBe("Direboar T7");
    expect(mobLabel({ kind: "other", name: "T9_MOB_X", count: 1 }, en)).toBe("T9_MOB_X");
  });
  it("orden: critters (recurso, tier alto primero), guardianes, miniguardianes, animales, otros", () => {
    const out = sortMobs([
      { kind: "animal", name: "bear", tier: null, count: 1 },
      { kind: "critter", resource: "WOOD", tier: 5, rank: "elite", count: 1 },
      { kind: "miniguardian", name: "ent", tier: 6, count: 1 },
      { kind: "critter", resource: "ORE", tier: 7, rank: "veteran", count: 1 },
      { kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 1 },
      { kind: "guardian", name: "dryad", tier: 8, count: 1 },
    ]);
    expect(out.map((m) => (m.kind === "critter" ? `${m.resource}${m.tier}` : m.kind))).toEqual(["ORE7", "ORE5", "WOOD5", "guardian", "miniguardian", "animal"]);
  });
});

describe("classifyMob", () => {
  it("critters de recolección: recurso, tier y rango", () => {
    expect(classifyMob("T5_MOB_CRITTER_ORE_ROADS_VETERAN", 3)).toEqual({ kind: "critter", resource: "ORE", tier: 5, rank: "veteran", count: 3 });
    expect(classifyMob("T7_MOB_CRITTER_ROCK_ROADS_ELITE", 1)).toEqual({ kind: "critter", resource: "STONE", tier: 7, rank: "elite", count: 1 });
    expect(classifyMob("T6_MOB_CRITTER_HIDE_MISTCOUGAR_VETERAN", 2)).toEqual({ kind: "critter", resource: "HIDE", tier: 6, rank: "veteran", count: 2 });
  });
  it("animales, con o sin tier", () => {
    expect(classifyMob("MOB_BEAR", 4)).toEqual({ kind: "animal", name: "bear", tier: null, count: 4 });
    expect(classifyMob("MOB_DIREWOLF", 1)).toEqual({ kind: "animal", name: "direwolf", tier: null, count: 1 });
    expect(classifyMob("T7_MOB_HIDE_FOREST_DIREBOAR_SMALL", 2)).toEqual({ kind: "animal", name: "direboar", tier: 7, count: 2 });
    expect(classifyMob("T1_MOB_HIDE_MISTS_WOLPERTINGER", 1)).toEqual({ kind: "animal", name: "wolpertinger", tier: 1, count: 1 });
  });
  it("guardianes y miniguardianes", () => {
    expect(classifyMob("T6_MOB_MINIGUARDIAN_ROADS_ENT", 1)).toEqual({ kind: "miniguardian", name: "ent", tier: 6, count: 1 });
    expect(classifyMob("T8_MOB_GUARDIAN_FOREST_ROCKGIANT", 1)).toEqual({ kind: "guardian", name: "rockgiant", tier: 8, count: 1 });
  });
  it("lo desconocido no rompe: queda como other con su nombre", () => {
    expect(classifyMob("T9_MOB_NUEVO_RARO", 2)).toEqual({ kind: "other", name: "T9_MOB_NUEVO_RARO", count: 2 });
  });
  it("classifyMobs agrupa y suma", () => {
    const out = classifyMobs([{ "@name": "MOB_BEAR", "@count": "2" }, { "@name": "MOB_BEAR", "@count": "3" }, { "@name": "T4_MOB_CRITTER_WOOD_ROADS_VETERAN", "@count": "1" }]);
    expect(out).toEqual([{ kind: "animal", name: "bear", tier: null, count: 5 }, { kind: "critter", resource: "WOOD", tier: 4, rank: "veteran", count: 1 }]);
  });
});
