// El QR de vínculo no deja el código en el DOM: el atributo data-code era un
// apoyo del humo y no debe llegar a producción (el código solo va en la imagen).
import { it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { CODE } = vi.hoisted(() => ({ CODE: "codigo-de-vinculo-de-prueba" }));
// Pinta el panel con un QR ya pedido: el único estado que empieza en null es el QR.
vi.mock("react", async (orig) => {
  const React = await orig<typeof import("react")>();
  const qr = { code: CODE, dataUrl: "data:image/png;base64,AAAA", expiresAt: Date.now() + 60_000 };
  return { ...React, useState: (init: unknown) => React.useState(init === null ? qr : init) };
});
vi.mock("swr", () => ({ default: () => ({ data: { devices: [] }, mutate: vi.fn() }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "en" }) }));

it("el QR de vínculo no expone el código en el DOM", async () => {
  const { DevicesPanel } = await import("@/components/profile/DevicesPanel");
  const html = renderToStaticMarkup(createElement(DevicesPanel));
  expect(html).toContain("data:image/png;base64,AAAA");
  expect(html).not.toContain("data-code");
  expect(html).not.toContain(CODE);
});
