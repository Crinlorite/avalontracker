import { exec } from "node:child_process";
import { promisify } from "node:util";
import { startPglite } from "./pglite-server";

// BD real en proceso para tests de integración: PGlite + `prisma db push`.
// Hay que llamarlo ANTES de importar nada que cree el cliente Prisma.
export async function startTestDb() {
  const port = 55000 + Math.floor(Math.random() * 5000);
  const db = await startPglite(port);
  // Asíncrono: PGlite vive en este mismo proceso y tiene que poder responder.
  await promisify(exec)("npx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: db.url },
  });
  process.env.DATABASE_URL = db.url;
  return db;
}
