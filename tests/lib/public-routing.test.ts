// Prefijo de idioma en las rutas públicas (fase 2b): lo usa el middleware.
import { describe, it, expect } from "vitest";
import { parsePublicPath } from "@/lib/public-routing";

describe("parsePublicPath", () => {
  it("sin prefijo → inglés", () => {
    expect(parsePublicPath("/zones/casitos-atinaum")).toEqual({ lang: "en", rest: "/zones/casitos-atinaum", explicitEn: false });
    expect(parsePublicPath("/")).toEqual({ lang: "en", rest: "/", explicitEn: false });
  });
  it("prefijo conocido → idioma y resto", () => {
    expect(parsePublicPath("/es/zones/casitos-atinaum")).toEqual({ lang: "es", rest: "/zones/casitos-atinaum", explicitEn: false });
    expect(parsePublicPath("/ja/exits")).toEqual({ lang: "ja", rest: "/exits", explicitEn: false });
    expect(parsePublicPath("/de")).toEqual({ lang: "de", rest: "/", explicitEn: false });
  });
  it("/en/... es inglés explícito (el middleware lo redirige a la ruta sin prefijo)", () => {
    expect(parsePublicPath("/en/zones")).toEqual({ lang: "en", rest: "/zones", explicitEn: true });
  });
  it("prefijo desconocido o rutas que solo parecen idioma → sin idioma", () => {
    expect(parsePublicPath("/xx/zones")).toEqual({ lang: null, rest: "/xx/zones", explicitEn: false });
    expect(parsePublicPath("/eu/zones")).toEqual({ lang: null, rest: "/eu/zones", explicitEn: false });
    expect(parsePublicPath("/i/abc")).toEqual({ lang: "en", rest: "/i/abc", explicitEn: false });
    expect(parsePublicPath("/italia/zones")).toEqual({ lang: "en", rest: "/italia/zones", explicitEn: false });
  });
});
