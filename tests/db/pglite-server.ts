// Postgres en proceso (PGlite, WebAssembly) para probar contra una BD real
// sin levantar ningún servicio ni contenedor. Uso:
//   npx tsx tests/db/pglite-server.ts [puerto]   → postgresql://postgres@127.0.0.1:<puerto>/postgres
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export async function startPglite(port: number) {
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    stop: async () => { await server.stop(); await db.close(); },
  };
}

if (process.argv[1]?.endsWith("pglite-server.ts")) {
  const port = Number(process.argv[2] ?? 54329);
  startPglite(port).then((s) => console.log(`[pglite] ${s.url}`));
}
