// Refresco manual de la caché de precios de AODP (self-host, humo).
//   DATABASE_URL=… npx tsx scripts/refresh-prices.ts
import { refreshPrices } from "../src/lib/market-prices";

refreshPrices().then((r) => {
  for (const x of r) console.log(`${x.server}: ${x.rows} filas${x.error ? ` — ERROR ${x.error}` : ""}`);
  process.exit(r.every((x) => !x.error) ? 0 : 1);
});
