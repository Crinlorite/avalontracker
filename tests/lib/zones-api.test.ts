// API pública de zonas (plan fase 2, Tarea 4): índice con ETag, ficha, 404, CORS, límite por IP.
import { describe, it, expect } from "vitest";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers: { "x-forwarded-for": "10.2.2.2", ...headers } });

describe("GET /api/v1/zones", () => {
  it("400 zonas con CORS, caché pública y ETag; If-None-Match → 304", async () => {
    const { GET } = await import("@/app/api/v1/zones/route");
    const r = await GET(req("http://t/api/v1/zones"));
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toContain("s-maxage=3600");
    const etag = r.headers.get("etag")!;
    expect(etag).toMatch(/^"[a-f0-9]{16,}"$/);
    const j = await r.json();
    expect(j.zones).toHaveLength(400);
    expect(j.zones.find((z: { name: string }) => z.name === "Casitos-Atinaum")).toMatchObject({ slug: "casitos-atinaum", tier: 6, family: "outlands", resources: ["FIBER"] });
    expect((await GET(req("http://t/api/v1/zones", { "if-none-match": etag }))).status).toBe(304);
    // Cloudflare debilita el ETag al recomprimir y el navegador reenvía W/"…" (o una lista).
    expect((await GET(req("http://t/api/v1/zones", { "if-none-match": `W/${etag}` }))).status).toBe(304);
    expect((await GET(req("http://t/api/v1/zones", { "if-none-match": `"otro", ${etag}` }))).status).toBe(304);
    expect((await GET(req("http://t/api/v1/zones", { "if-none-match": `"otro"` }))).status).toBe(200);
  });
  it("OPTIONS (preflight) responde 204 con CORS", async () => {
    const { OPTIONS } = await import("@/app/api/v1/zones/route");
    const r = await OPTIONS();
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-headers")).toContain("if-none-match");
  });
});

describe("GET /api/v1/zones/{name}", () => {
  it("acepta nombre o slug; trae bichos, botín por cofre y enlaces", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/route");
    const r = await GET(req("http://t/x"), { params: Promise.resolve({ name: "casitos-atinaum" }) });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.name).toBe("Casitos-Atinaum");
    expect(j.mobs.length).toBeGreaterThan(0);
    expect(j.chests.find((c: { type: string; size: string }) => c.type === "GREEN" && c.size === "small").loot[0]).toHaveProperty("category");
    expect(j.links).toEqual({ web: "https://avalontracker.app/zones/casitos-atinaum", prices: "https://avalontracker.app/api/v1/zones/casitos-atinaum/prices" });
    expect((await GET(req("http://t/x"), { params: Promise.resolve({ name: "Casitos-Atinaum" }) })).status).toBe(200);
  });
  it("zona inexistente → 404 JSON con CORS", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/route");
    const r = await GET(req("http://t/x"), { params: Promise.resolve({ name: "nope" }) });
    expect(r.status).toBe(404);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await r.json()).error.code).toBe("NOT_FOUND");
  });
  it("61 peticiones en un minuto desde la misma IP → 429", async () => {
    const { GET } = await import("@/app/api/v1/zones/[name]/route");
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await GET(req("http://t/x", { "x-forwarded-for": "10.7.7.7" }), { params: Promise.resolve({ name: "casitos-atinaum" }) })).status;
    expect(last).toBe(429);
  });
});
