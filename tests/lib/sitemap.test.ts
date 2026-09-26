// Sitemap con las páginas públicas en los 11 idiomas y hreflang (fase 2b).
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  const entries = sitemap();
  it("lista /zones, /exits y las 400 fichas en 11 idiomas", () => {
    const urls = new Set(entries.map((e) => e.url));
    expect(urls.has("https://avalontracker.app/zones")).toBe(true);
    expect(urls.has("https://avalontracker.app/de/zones")).toBe(true);
    expect(urls.has("https://avalontracker.app/ko/exits")).toBe(true);
    expect(urls.has("https://avalontracker.app/pt/zones/casitos-atinaum")).toBe(true);
    expect(urls.has("https://avalontracker.app/en/zones")).toBe(false);
    expect(entries.filter((e) => /\/zones\/[a-z-]+$/.test(e.url))).toHaveLength(400 * 11);
  });
  it("cada página pública enlaza sus 11 versiones y x-default = inglés", () => {
    const e = entries.find((x) => x.url === "https://avalontracker.app/fr/zones/casitos-atinaum")!;
    const langs = e.alternates!.languages as Record<string, string>;
    expect(Object.keys(langs).sort()).toEqual(["de", "en", "es", "fr", "it", "ja", "ko", "pl", "pt", "ru", "x-default", "zh"]);
    expect(langs.en).toBe("https://avalontracker.app/zones/casitos-atinaum");
    expect(langs["x-default"]).toBe("https://avalontracker.app/zones/casitos-atinaum");
    expect(langs.ja).toBe("https://avalontracker.app/ja/zones/casitos-atinaum");
  });
});
