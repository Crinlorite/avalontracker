// Universal Links (AASA) y App Links (assetlinks.json) (plan fase 1, Tarea 10).
import { describe, it, expect, afterEach } from "vitest";

describe(".well-known", () => {
  afterEach(() => { delete process.env.ANDROID_SIGNING_SHA256; });

  it("AASA declara la app y las rutas /m y /i", async () => {
    const { GET } = await import("@/app/.well-known/apple-app-site-association/route");
    const r = await GET();
    expect(r.headers.get("content-type")).toContain("application/json");
    const j = await r.json();
    expect(j.applinks.details[0]).toEqual({ appID: "2JE586S3VM.com.crintechstudios.avalontracker", paths: ["/m/*", "/i/*"] });
  });

  it("assetlinks vacío sin variable y con huellas cuando la hay", async () => {
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    expect(await (await GET()).json()).toEqual([]);
    process.env.ANDROID_SIGNING_SHA256 = "AA:BB:CC, DD:EE:FF";
    const j = await (await GET()).json();
    expect(j[0].target.package_name).toBe("com.crintechstudios.avalontracker");
    expect(j[0].target.sha256_cert_fingerprints).toEqual(["AA:BB:CC", "DD:EE:FF"]);
  });
});
