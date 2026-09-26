// Codec v1 de rutas compartidas, idéntico al de la app (plan fase 1, Tarea 9).
import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeRouteCode, encodeRouteCode, extractCode } from "@/lib/route-codec";

const b64u = (b: Buffer) => b.toString("base64url").replace(/=+$/, "");
const flutterLike = (payload: unknown) => b64u(gzipSync(Buffer.from(JSON.stringify(payload))));

describe("route codec v1", () => {
  it("decodifica un código con la forma exacta de la app", () => {
    const e = Date.now() + 3600e3;
    const r = decodeRouteCode(flutterLike({ v: 1, n: "ojo gankers", h: [
      { f: "Casitos-Atinaum", t: "Hiles-Izizaum", s: 7, e },
      { f: "Hiles-Izizaum", t: "Coros-Atinaum", s: 20, e: e + 1000, st: "W", sn: "vigilado" },
    ] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.notes).toBe("ojo gankers");
    expect(r.route.hops.map((h) => [h.fromZone, h.portalSize, h.status])).toEqual([["Casitos-Atinaum", 7, "ACTIVE"], ["Hiles-Izizaum", 20, "WATCHED"]]);
    expect(r.route.hops[1].statusNote).toBe("vigilado");
    expect(r.route.hops[0].expiresAt.getTime()).toBe(e);
  });

  it("ida y vuelta", () => {
    const route = { notes: "x", hops: [{ fromZone: "A-B", toZone: "C-D", portalSize: 7, expiresAt: new Date(1_800_000_000_000), status: "COLLAPSED" as const, statusNote: "n" }] };
    const r = decodeRouteCode(encodeRouteCode(route));
    expect(r.ok && r.route).toEqual(route);
  });

  it("acepta enlaces completos", () => {
    const code = encodeRouteCode({ hops: [{ fromZone: "A", toZone: "B", portalSize: 7, expiresAt: new Date(1_800_000_000_000), status: "ACTIVE" }] });
    expect(extractCode(`avalontracker://r/${code}`)).toBe(code);
    expect(extractCode(`https://avalontracker.app/i/${code}`)).toBe(code);
    expect(extractCode(`  ${code}\n`)).toBe(code);
  });

  it("rechaza basura, versión desconocida y bombas de descompresión", () => {
    expect(decodeRouteCode("no-es-base64!!")).toEqual({ ok: false, reason: "invalid" });
    expect(decodeRouteCode(b64u(Buffer.from("hola")))).toEqual({ ok: false, reason: "invalid" });
    expect(decodeRouteCode(flutterLike({ v: 2, h: [] }))).toEqual({ ok: false, reason: "unsupported_version" });
    expect(decodeRouteCode(flutterLike({ v: 1, h: [] }))).toEqual({ ok: false, reason: "invalid" });
    expect(decodeRouteCode(b64u(gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x20))))).toEqual({ ok: false, reason: "too_big" });
  });
});
