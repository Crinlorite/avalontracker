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
  it("CF-Connecting-IP solo vale si quien conecta es Cloudflare (el origen también responde sin pasar por él)", () => {
    // Traefik pisa X-Real-IP y X-Forwarded-For con quien conecta, pero deja pasar CF-Connecting-IP tal cual.
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(req({ "cf-connecting-ip": "2001:db8::1", "x-real-ip": "2001:db8:ffff::2" }))).toBe("2001:db8:ffff::2");
  });
  it("borde de Cloudflare por IPv4 e IPv6 → CF-Connecting-IP", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "172.70.0.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "104.23.255.254" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "cf-connecting-ip": "2001:db8::1", "x-real-ip": "2a06:98c0:3600::103" }))).toBe("2001:db8::1");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "::ffff:162.158.1.1" }))).toBe("203.0.113.9");
  });
  it("una IP justo fuera de los rangos de Cloudflare no cuenta como borde", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "104.32.0.1" }))).toBe("104.32.0.1");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "2606:4701::1" }))).toBe("2606:4701::1");
  });
  it("una IP mal formada no revienta: se usa tal cual y no cuenta como borde", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "1:2:3:4:5:6:7::8:9" }))).toBe("1:2:3:4:5:6:7::8:9");
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-real-ip": "172.70.0.999" }))).toBe("172.70.0.999");
  });
  it("sin cabeceras → unknown", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
