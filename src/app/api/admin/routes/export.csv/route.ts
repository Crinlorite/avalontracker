// src/app/api/admin/routes/export.csv/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

function csvEscape(v: unknown): string {
  let s = String(v ?? "");
  // CSV formula injection: Excel/Sheets evalúa celdas que empiezan por
  // = + - @ \t \r como fórmulas. Prefijamos con apóstrofo para
  // neutralizar (la cell ya no se interpreta como fórmula).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const routes = await prisma.route.findMany({
    include: {
      clan: { select: { name: true } },
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { discordUsername: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = ["clan,creador,cadena,sizes,createdAt,status,updatedAt"];
  for (const r of routes) {
    const chain = r.hops.map((h) => `${h.fromZone.name}->${h.toZone.name}`).join(" | ");
    const sizes = r.hops.map((h) => h.portalSize).join(",");
    const creator = r.createdBy.displayName ?? r.createdBy.discordUsername;
    rows.push([
      csvEscape(r.clan.name), csvEscape(creator), csvEscape(chain), csvEscape(sizes),
      csvEscape(r.createdAt.toISOString()), csvEscape(r.status), csvEscape(r.updatedAt.toISOString()),
    ].join(","));
  }
  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="routes_${Date.now()}.csv"`,
    },
  });
}
