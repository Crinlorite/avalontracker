// Autocompletado del buscador de zonas (plan fase 1, Tarea 13).
import { describe, it, expect } from "vitest";
import { suggestZones } from "@/lib/zone-suggest";

const names = ["Casitos-Atinaum", "Casos-Aiagsum", "Cases-Ugumlos", "Fucas-Ornum", "Hiles-Izizaum", "Coros-Atinaum", "Casitos-Alieam", "Casos-Aximam", "Casos-Ayosrom", "Casos-Uruxtum", "Cebitos-Aeaylum"];

describe("suggestZones", () => {
  it("no sugiere nada con menos de 3 letras (guiones y espacios no cuentan)", () => {
    expect(suggestZones("", names)).toEqual([]);
    expect(suggestZones("ca", names)).toEqual([]);
    expect(suggestZones("c-a ", names)).toEqual([]);
  });
  it("primero las que empiezan por el texto, luego las que lo contienen; alfabético", () => {
    expect(suggestZones("cas", names)).toEqual(["Cases-Ugumlos", "Casitos-Alieam", "Casitos-Atinaum", "Casos-Aiagsum", "Casos-Aximam", "Casos-Ayosrom", "Casos-Uruxtum", "Fucas-Ornum"]);
    expect(suggestZones("atin", names)).toEqual(["Casitos-Atinaum", "Coros-Atinaum"]);
  });
  it("ignora mayúsculas y guiones al comparar", () => {
    expect(suggestZones("casitosAT", names)).toEqual(["Casitos-Atinaum"]);
    expect(suggestZones("CASITOS-ALI", names)).toEqual(["Casitos-Alieam"]);
  });
  it("respeta el máximo y devuelve vacío sin coincidencias", () => {
    expect(suggestZones("cas", names, 3)).toEqual(["Cases-Ugumlos", "Casitos-Alieam", "Casitos-Atinaum"]);
    expect(suggestZones("zzz", names)).toEqual([]);
  });
});
