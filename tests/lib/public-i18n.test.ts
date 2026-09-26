// Páginas públicas en 11 idiomas (fase 2b): diccionarios completos y coherentes.
import { describe, it, expect } from "vitest";
import { PUBLIC_LANGS, isPublicLang, publicPath, publicT, publicDictionaries, publicLangName, isBetaLang, PUBLIC_LOCALE } from "@/i18n/public";

const VARS = /\{[a-zA-Z]+\}/g;

describe("idiomas públicos", () => {
  it("son los 11 internacionales, en y es primero", () => {
    expect(PUBLIC_LANGS).toEqual(["en", "es", "de", "fr", "ru", "pl", "pt", "it", "zh", "ja", "ko"]);
    expect(isPublicLang("de")).toBe(true);
    expect(isPublicLang("eu")).toBe(false);
    expect(isPublicLang("")).toBe(false);
  });
  it("rutas: en sin prefijo, el resto con /xx", () => {
    expect(publicPath("en", "/zones")).toBe("/zones");
    expect(publicPath("es", "/zones/casitos-atinaum")).toBe("/es/zones/casitos-atinaum");
    expect(publicPath("ja", "/exits?from=X")).toBe("/ja/exits?from=X");
  });
  it("nombres nativos, beta salvo en/es, locale por idioma", () => {
    expect(publicLangName("de")).toBe("Deutsch");
    expect(publicLangName("ja")).toBe("日本語");
    expect(isBetaLang("en")).toBe(false);
    expect(isBetaLang("es")).toBe(false);
    expect(isBetaLang("pt")).toBe(true);
    expect(PUBLIC_LOCALE.pt).toBe("pt-BR");
    expect(PUBLIC_LOCALE.zh).toBe("zh-CN");
  });
  it("cada diccionario tiene exactamente las claves de en, sin vacíos y con los mismos {marcadores}", () => {
    const dicts = publicDictionaries();
    const en = dicts.en;
    const keys = Object.keys(en).sort();
    for (const lang of PUBLIC_LANGS) {
      const d = dicts[lang];
      expect(Object.keys(d).sort(), lang).toEqual(keys);
      for (const k of keys) {
        expect(d[k as keyof typeof d].trim().length, `${lang}:${k}`).toBeGreaterThan(0);
        const want = [...(en[k as keyof typeof en].match(VARS) ?? [])].sort();
        const got = [...(d[k as keyof typeof d].match(VARS) ?? [])].sort();
        expect(got, `${lang}:${k}`).toEqual(want);
      }
    }
  });
  it("las traducciones no son copias del inglés (muestra de claves con texto)", () => {
    const dicts = publicDictionaries();
    for (const lang of PUBLIC_LANGS.filter((l) => l !== "en")) {
      const same = (["zones.intro", "zone.exits.body", "exits.intro", "prices.note"] as const).filter((k) => dicts[lang][k] === dicts.en[k]);
      expect(same, lang).toEqual([]);
    }
  });
  it("publicT interpola y cae al inglés si faltara una clave", () => {
    expect(publicT("de")("exits.hops", { n: 3 })).toContain("3");
    expect(publicT("ko")("zone.h1sub", { tier: 6 })).toContain("6");
  });
});
