// Vectores del buscador de salidas para la app KMP: ciudad royal y portales más cercanos.
//   npx tsx scripts/export-exits-fixtures.ts <salida.json>
import fs from "node:fs";
import meta from "../src/data/world-meta.json";
import { getZonePvp, nearestRoyalCity, nearestRoyalPortals } from "../src/lib/world-meta";

const pvp = meta.pvp as Record<string, string>;
const names = Object.keys(pvp).filter((n) => !/^\d+$/.test(n)).sort();
const pick = (type: string, n: number) => names.filter((z) => pvp[z] === type).slice(0, n);
const zones = ["Battlebrae Lake", "Lymhurst", "Martlock", "Fort Sterling", "Caerleon", "Brecilien", "Zona-Inexistente", ...pick("yellow", 3), ...pick("red", 3), ...pick("black", 3), ...pick("blue", 2)];
const out = [...new Set(zones)].map((zone) => ({
  zone,
  pvp: getZonePvp(zone),
  city: nearestRoyalCity(zone),
  portals: nearestRoyalPortals(zone, 2),
}));
fs.writeFileSync(process.argv[2] ?? "exits.json", JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} zonas → ${process.argv[2]}`);
