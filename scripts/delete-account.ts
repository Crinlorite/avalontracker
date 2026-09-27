// Borra una cuenta a petición del usuario (sección «Borrar tu cuenta» de
// /legal/privacy). Solo se ejecuta a mano y, sin --apply, solo enseña lo
// que borraría:
//
//   npx tsx scripts/delete-account.ts <id | discordId | usuario de Discord> [--apply]
//
// Se borran la cuenta, sus dispositivos, sus membresías y sus mapas
// personales enteros. Lo que aportó a mapas ajenos se queda para sus
// dueños, pero pasa a una cuenta fantasma «usuario eliminado»: las rutas,
// los clanes y la auditoría exigen un autor y no puede seguir siendo él.

// Path relativo (no alias `@/`) — tsx en standalone no resuelve los
// `paths` de tsconfig.json fuera del contexto de Next.js.
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// La cuenta fantasma nunca inicia sesión: su discordId no es un snowflake.
export const DELETED_USER_DISCORD_ID = "deleted-user";

export async function deleteAccount(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ghost = await tx.user.upsert({
      where: { discordId: DELETED_USER_DISCORD_ID },
      create: { discordId: DELETED_USER_DISCORD_ID, discordUsername: "deleted-user", displayName: "Deleted user", email: "deleted-user@avalontracker.invalid" },
      update: {},
    });
    if (ghost.id === userId) throw new Error("La cuenta «usuario eliminado» no se borra");
    const { id } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } });

    // Borrar el mapa personal arrastra en cascada rutas, saltos, enlaces y auditoría.
    await tx.clan.deleteMany({ where: { createdById: id, kind: "PERSONAL" } });
    await tx.clan.updateMany({ where: { createdById: id }, data: { createdById: ghost.id } });
    await tx.route.updateMany({ where: { createdById: id }, data: { createdById: ghost.id } });
    await tx.route.updateMany({ where: { disabledById: id }, data: { disabledById: ghost.id } });
    await tx.routeHop.updateMany({ where: { statusSetById: id }, data: { statusSetById: ghost.id } });
    await tx.mapShare.updateMany({ where: { createdById: id }, data: { createdById: ghost.id } });
    await tx.auditLog.updateMany({ where: { userId: id }, data: { userId: ghost.id } });
    // Dispositivos y membresías caen en cascada con el usuario.
    await tx.user.delete({ where: { id } });
  });
}

async function main() {
  const [who, flag] = process.argv.slice(2);
  if (!who) {
    console.error("Uso: npx tsx scripts/delete-account.ts <id | discordId | usuario de Discord> [--apply]");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[delete-account] DATABASE_URL no definida; abortando");
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const users = await prisma.user.findMany({
      where: { OR: [{ id: who }, { discordId: who }, { discordUsername: who }] },
      select: { id: true, discordUsername: true, isGuest: true, createdAt: true, _count: { select: { deviceTokens: true, clanMembers: true, routesCreated: true } } },
    });
    if (users.length !== 1) {
      console.error(`[delete-account] ${users.length} cuentas coinciden con «${who}»; usa el id`);
      process.exit(1);
    }
    const u = users[0];
    const personal = await prisma.clan.findMany({ where: { createdById: u.id, kind: "PERSONAL" }, select: { name: true, _count: { select: { routes: true } } } });
    console.log(`Cuenta ${u.id} · ${u.discordUsername}${u.isGuest ? " (invitado)" : ""} · creada ${u.createdAt.toISOString().slice(0, 10)}`);
    console.log(`  dispositivos: ${u._count.deviceTokens} · membresías: ${u._count.clanMembers} · rutas creadas: ${u._count.routesCreated}`);
    console.log(`  mapas personales que se borran enteros: ${personal.map((c) => `${c.name} (${c._count.routes} rutas)`).join(", ") || "ninguno"}`);
    if (flag !== "--apply") {
      console.log("Simulación: no se ha borrado nada. Repite con --apply para borrar.");
      return;
    }
    await deleteAccount(prisma, u.id);
    console.log("Cuenta borrada.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.VITEST !== "true" && process.argv[1]?.includes("delete-account")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
