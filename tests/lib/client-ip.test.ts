// IP del cliente tras Cloudflare → Traefik (revisión final fase 2, importante 3).
import { describe, it, expect } from "vitest";
import { clientIp } from "@/lib/client-ip";

const req = (h: Record<string, string>) => new Request("http://t/x", { headers: h });

describe("clientIp", () => {
  it("prefiere cf-connecting-ip (Traefik reescribe X-Forwarded-For con la IP del edge)", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "188.114.96.5", "x-real-ip": "188.114.96.5" }))).toBe("203.0.113.9");
  });
  it("sin Cloudflare: x-real-ip, luego el primer salto de x-forwarded-for", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "10.0.0.1, 198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(req({ "x-forwarded-for": " 192.0.2.4 , 10.0.0.1" }))).toBe("192.0.2.4");
  });
  it("sin cabeceras → unknown", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
