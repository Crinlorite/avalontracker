// Discord devuelve `iss=https://discord.com` en la vuelta del OAuth (RFC 9207) y Auth.js lo compara
// con el emisor del proveedor, que sin declarar es `https://authjs.dev` → «unexpected "iss"» y el
// inicio de sesión cae con «Server error». Se reproduce la misma comprobación que hace Auth.js.
import { describe, it, expect } from "vitest";
import * as o from "oauth4webapi";
import { authConfig } from "@/lib/auth.config";

describe("proveedor Discord", () => {
  it("acepta la respuesta de autorización con el iss que manda Discord", () => {
    const discord = authConfig.providers[0] as unknown as { issuer?: string; options?: { issuer?: string } };
    const issuer = discord.options?.issuer ?? discord.issuer ?? "https://authjs.dev";
    const as = { issuer, token_endpoint: "https://discord.com/api/oauth2/token" };
    const params = new URLSearchParams({ code: "c", state: "s", iss: "https://discord.com" });
    expect(() => o.validateAuthResponse(as, { client_id: "x" }, params, "s")).not.toThrow();
  });
});
