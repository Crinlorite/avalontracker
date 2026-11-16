import { describe, expect, it } from "vitest";
import { TERMS, parseTerms, splitLinks } from "@/lib/legal-terms";

describe("términos del servicio", () => {
  for (const lang of ["es", "en"] as const) {
    const doc = parseTerms(TERMS[lang]);

    it(`${lang}: tiene los 19 apartados numerados en orden`, () => {
      expect(doc.sections.map((s) => s.n)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    });

    it(`${lang}: no quedan huecos por rellenar`, () => {
      expect(TERMS[lang]).not.toMatch(/\[[A-ZÁÉÍÓÚ ]+\]/);
    });

    it(`${lang}: identifica al titular con domicilio, correo y teléfono`, () => {
      const s1 = doc.sections[0].blocks.flatMap((b) => (b.kind === "p" ? [b.text] : b.items.map((i) => i.text))).join(" ");
      expect(s1).toContain("Calle Lapurbide 12");
      expect(s1).toContain("avalon@crintech.pro");
      expect(s1).toContain("+34 623 05 14 56");
    });

    it(`${lang}: lleva fecha de vigencia`, () => {
      expect(doc.effective).toMatch(/16\/11\/2026|2026-11-16/);
    });
  }

  it("las viñetas anidadas cuelgan de la anterior", () => {
    const d = parseTerms("T\nX: 1\n\n1. A\n- uno\n  - dos\n- tres\n");
    const ul = d.sections[0].blocks[0];
    expect(ul.kind).toBe("ul");
    if (ul.kind !== "ul") return;
    expect(ul.items.map((i) => i.text)).toEqual(["uno", "tres"]);
    expect(ul.items[0].sub).toEqual(["dos"]);
  });

  it("convierte correos y URL en enlaces", () => {
    expect(splitLinks("Escribe a avalon@crintech.pro o mira https://avalontracker.app.")).toEqual([
      "Escribe a ",
      { href: "mailto:avalon@crintech.pro", label: "avalon@crintech.pro" },
      " o mira ",
      { href: "https://avalontracker.app", label: "https://avalontracker.app" },
      ".",
    ]);
  });
});
