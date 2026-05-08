// Borra duplicados de RouteHop antes de que `prisma db push` aplique
// el constraint @@unique([routeId, fromZoneId, toZoneId]). Sin esto,
// el push falla en la primera migración tras añadir el constraint si
// la BD live tiene cualquier histórico de duplicados (race conditions
// pre-fix, o data manual).
//
// Idempotente — si no hay duplicados, no hace nada. Seguro para correr
// en cada deploy (muy barato: el GROUP BY tarda <100ms en tablas
// pequeñas y la query DELETE solo toca rows duplicadas).
//
// Política de keep: el de id más bajo (= el más antiguo). Asume que el
// primero en insertarse ganó el race. Si el más antiguo fuera un
// tombstone soft-deleted y el más nuevo el activo, esta política
// borraría el activo — pero esto es un caso patológico (¿cómo
// reapareció el mismo edge en el mismo route?) y la pérdida es
// recuperable manualmente vía la papelera del clan.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[cleanup-routehop-duplicates] DATABASE_URL no definida; abortando");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  // Cuenta primero para log informativo. El COUNT es barato y nos da
  // una métrica visible para detectar si algo está creando duplicados
  // en producción.
  const dups = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM (
      SELECT 1 FROM "RouteHop"
      GROUP BY "routeId", "fromZoneId", "toZoneId"
      HAVING COUNT(*) > 1
    ) sub
  `;
  const dupCount = Number(dups[0]?.count ?? 0n);
  if (dupCount === 0) {
    console.log("[cleanup-routehop-duplicates] sin duplicados, nada que limpiar");
    await prisma.$disconnect();
    return;
  }

  console.log(`[cleanup-routehop-duplicates] ${dupCount} edges con duplicados, limpiando…`);
  const deleted = await prisma.$executeRaw`
    DELETE FROM "RouteHop" a USING "RouteHop" b
    WHERE a.id > b.id
      AND a."routeId" = b."routeId"
      AND a."fromZoneId" = b."fromZoneId"
      AND a."toZoneId" = b."toZoneId"
  `;
  console.log(`[cleanup-routehop-duplicates] ${deleted} filas duplicadas borradas`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[cleanup-routehop-duplicates] fallo:", err);
  process.exit(1);
});
