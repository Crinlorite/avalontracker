// Cruce del códec v1 con la app KMP: lee códigos (uno por línea, opcionalmente
// `código<TAB>etiqueta esperada`) y los decodifica con el códec de la web.
// Sale con 1 si alguno no decodifica o su etiqueta no coincide.
//   npx tsx scripts/verify-route-codes.ts /ruta/codes.txt
import { readFileSync } from "node:fs";
import { decodeRouteCode, encodeRouteCode } from "../src/lib/route-codec";

const file = process.argv[2];
if (!file) { console.error("uso: verify-route-codes.ts <fichero>"); process.exit(2); }
const lines = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
let bad = 0;
for (const line of lines) {
  const [code, expected] = line.split("\t");
  const r = decodeRouteCode(code);
  if (!r.ok) { console.error(`✗ no decodifica (${r.reason}): ${code.slice(0, 24)}…`); bad++; continue; }
  const label = [r.route.hops[0]?.fromZone, ...r.route.hops.map((h) => h.toZone)].join(" → ");
  if (expected && expected !== label) { console.error(`✗ etiqueta ${JSON.stringify(label)} ≠ esperada ${JSON.stringify(expected)}`); bad++; continue; }
  // Ida y vuelta: lo que la web vuelve a codificar debe decodificar igual.
  const again = decodeRouteCode(encodeRouteCode(r.route));
  if (!again.ok || JSON.stringify(again.route) !== JSON.stringify(r.route)) { console.error(`✗ ida y vuelta distinta: ${label}`); bad++; continue; }
  console.log(`✓ ${label} (${r.route.hops.length} saltos${r.route.notes ? ", con notas" : ""})`);
}
console.log(`${lines.length - bad}/${lines.length} códigos de la app KMP decodifican en la web`);
process.exit(bad ? 1 : 0);
