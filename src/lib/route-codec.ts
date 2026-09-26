// Códigos de ruta compartida, formato v1 de la app (lib/core/share/route_codec.dart):
// JSON compacto → gzip → base64url sin `=`. Es el payload de
// avalontracker://r/<código>, https://avalontracker.app/i/<código> y el QR.
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";

export const ROUTE_CODE_VERSION = 1;
export const MAX_DECODED_BYTES = 64 * 1024;
export type HopStatus = "ACTIVE" | "EXPIRED" | "COLLAPSED" | "WATCHED";
export type SharedHop = { fromZone: string; toZone: string; portalSize: number; expiresAt: Date; status: HopStatus; statusNote?: string };
export type SharedRoute = { notes?: string; hops: SharedHop[] };
export type DecodeResult = { ok: true; route: SharedRoute } | { ok: false; reason: "invalid" | "unsupported_version" | "too_big" };

const STATUS_BY_CODE: Record<string, HopStatus> = { A: "ACTIVE", E: "EXPIRED", C: "COLLAPSED", W: "WATCHED" };
const CODE_BY_STATUS: Record<HopStatus, string> = { ACTIVE: "A", EXPIRED: "E", COLLAPSED: "C", WATCHED: "W" };

const payloadSchema = z.object({
  v: z.number().int(),
  n: z.string().max(200).optional(),
  h: z.array(z.object({
    f: z.string().min(1).max(100), t: z.string().min(1).max(100),
    s: z.number().int().min(1).max(100), e: z.number().int().positive(),
    st: z.enum(["A", "E", "C", "W"]).optional(), sn: z.string().max(100).optional(),
  })).min(1).max(50),
}).strict();

// Acepta el código pelado, el deep link o la URL web.
export function extractCode(raw: string): string {
  const s = raw.trim();
  if (/^(avalontracker:\/\/|https?:\/\/)/i.test(s)) return s.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  return s;
}

export function decodeRouteCode(raw: string): DecodeResult {
  const code = extractCode(raw);
  if (!/^[A-Za-z0-9_-]{8,8000}$/.test(code)) return { ok: false, reason: "invalid" };
  let json: unknown;
  try {
    const bytes = gunzipSync(Buffer.from(code, "base64url"), { maxOutputLength: MAX_DECODED_BYTES });
    json = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    return { ok: false, reason: (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "too_big" : "invalid" };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    const v = (json as { v?: unknown })?.v;
    return { ok: false, reason: typeof v === "number" && v !== ROUTE_CODE_VERSION ? "unsupported_version" : "invalid" };
  }
  if (parsed.data.v !== ROUTE_CODE_VERSION) return { ok: false, reason: "unsupported_version" };
  return {
    ok: true,
    route: {
      ...(parsed.data.n ? { notes: parsed.data.n } : {}),
      hops: parsed.data.h.map((h) => ({
        fromZone: h.f, toZone: h.t, portalSize: h.s, expiresAt: new Date(h.e),
        status: STATUS_BY_CODE[h.st ?? "A"], ...(h.sn ? { statusNote: h.sn } : {}),
      })),
    },
  };
}

export function encodeRouteCode(route: SharedRoute): string {
  const payload = {
    v: ROUTE_CODE_VERSION,
    ...(route.notes?.trim() ? { n: route.notes.trim() } : {}),
    h: route.hops.map((h) => ({
      f: h.fromZone, t: h.toZone, s: h.portalSize, e: h.expiresAt.getTime(),
      ...(h.status !== "ACTIVE" ? { st: CODE_BY_STATUS[h.status] } : {}),
      ...(h.statusNote?.trim() ? { sn: h.statusNote.trim() } : {}),
    })),
  };
  return gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64url").replace(/=+$/, "");
}
