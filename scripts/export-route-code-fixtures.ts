// Vectores del códec v1 para la app KMP (avalontracker-kmp/shared/src/commonTest/fixtures/route-codes.json).
//   npx tsx scripts/export-route-code-fixtures.ts [ruta de salida]
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { encodeRouteCode, decodeRouteCode } from "../src/lib/route-codec";

const b64u = (b: Buffer) => b.toString("base64url").replace(/=+$/, "");
const t0 = 1_790_000_000_000; // 2026-09-21T…Z, fijo para que el fichero sea reproducible
const mk = (route: Parameters<typeof encodeRouteCode>[0]) => {
  const code = encodeRouteCode(route);
  const d = decodeRouteCode(code);
  if (!d.ok) throw new Error("el propio códec no decodifica " + JSON.stringify(route));
  return { code, expected: { notes: d.route.notes ?? null, hops: d.route.hops.map((h) => ({ fromZone: h.fromZone, toZone: h.toZone, portalSize: h.portalSize, expiresAtMs: h.expiresAt.getTime(), status: h.status, statusNote: h.statusNote ?? null })) } };
};
const out = [
  { name: "un salto activo", ...mk({ hops: [{ fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(t0 + 3600e3), status: "ACTIVE" }] }) },
  { name: "tres saltos, vigilado con nota y notas de ruta", ...mk({ notes: "ojo gankers en la 2ª", hops: [
    { fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(t0 + 3600e3), status: "ACTIVE" },
    { fromZone: "Hiles-Izizaum", toZone: "Coros-Atinaum", portalSize: 20, expiresAt: new Date(t0 + 7200e3), status: "WATCHED", statusNote: "vigilado" },
    { fromZone: "Coros-Atinaum", toZone: "Siros-Ofurlos", portalSize: 7, expiresAt: new Date(t0 + 5400e3), status: "COLLAPSED" },
  ] }) },
  { name: "no ASCII", ...mk({ notes: "Ñoño → Ærø 日本", hops: [{ fromZone: "Ñoño-Ærø", toZone: "Zōne-Ü", portalSize: 20, expiresAt: new Date(t0 + 60e3), status: "EXPIRED", statusNote: "café" }] }) },
  { name: "portal heredado 40", ...mk({ hops: [{ fromZone: "A-B", toZone: "C-D", portalSize: 40, expiresAt: new Date(t0 + 1800e3), status: "ACTIVE" }] }) },
  { name: "versión 2", code: b64u(gzipSync(Buffer.from(JSON.stringify({ v: 2, h: [] })))), expectedError: "unsupported_version" },
  { name: "no es JSON", code: b64u(gzipSync(Buffer.from("hola"))), expectedError: "invalid" },
  { name: "sin saltos", code: b64u(gzipSync(Buffer.from(JSON.stringify({ v: 1, h: [] })))), expectedError: "invalid" },
  { name: "bomba de 5 MB", code: b64u(gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x20))), expectedError: "too_big" },
  { name: "base64 inválido", code: "no-es-base64!!", expectedError: "invalid" },
];
for (const o of out) if ("expectedError" in o) { const d = decodeRouteCode(o.code); if (d.ok || d.reason !== o.expectedError) throw new Error(`${o.name}: la web da ${JSON.stringify(d)}`); }
const dest = process.argv[2] ?? "route-codes.json";
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} vectores → ${dest}`);
