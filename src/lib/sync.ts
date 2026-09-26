// Sincronización por mapa (spec §6): identidad por id de cliente (rutas) y
// clave natural (saltos); «el servidor manda»: una fila cuyo updatedAt en
// el servidor no coincide con baseUpdatedAt se rechaza como stale.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const PULL_LIMIT = 500;
export const PUSH_LIMIT = 200;

const isoDate = z.string().datetime({ offset: true });
const clientId = z.string().regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,30})$/);

export const routeChangeSchema = z.object({
  id: clientId,
  notes: z.string().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  deletedAt: isoDate.nullable().optional(),
  baseUpdatedAt: isoDate.optional(),
}).strict();

export const hopChangeSchema = z.object({
  routeId: clientId,
  fromZone: z.string().min(1).max(100),
  toZone: z.string().min(1).max(100),
  order: z.number().int().min(0).max(49),
  // Espejo de datos: se aceptan los tamaños heredados (2, 40) para no perder filas.
  portalSize: z.union([z.literal(2), z.literal(7), z.literal(20), z.literal(40)]),
  expiresAt: isoDate,
  status: z.enum(["ACTIVE", "EXPIRED", "COLLAPSED", "WATCHED"]).optional(),
  statusNote: z.string().max(100).nullable().optional(),
  deletedAt: isoDate.nullable().optional(),
  baseUpdatedAt: isoDate.optional(),
}).strict();

export const pushSchema = z.object({
  routes: z.array(routeChangeSchema).max(PUSH_LIMIT).default([]),
  hops: z.array(hopChangeSchema).max(PUSH_LIMIT).default([]),
}).strict().refine((b) => b.routes.length + b.hops.length <= PUSH_LIMIT, { message: `Lote de más de ${PUSH_LIMIT} filas` });

export type PushBatch = z.infer<typeof pushSchema>;
export type ChangeKey = { kind: "route"; id: string } | { kind: "hop"; routeId: string; fromZone: string; toZone: string };
export type RouteRow = { id: string; notes: string | null; status: string; disabledAt: string | null; deletedAt: string | null; createdAt: string; updatedAt: string };
export type HopRow = { id: number; routeId: string; fromZone: string; toZone: string; order: number; portalSize: number; expiresAt: string; status: string; statusNote: string | null; deletedAt: string | null; updatedAt: string };
export type PullResult = { routes: RouteRow[]; hops: HopRow[]; serverTime: string; hasMore: boolean; next: string | null };
export type PushResult = { applied: ChangeKey[]; rejected: { key: ChangeKey; reason: "stale" | "not_in_map"; server?: RouteRow | HopRow }[]; serverTime: string };

export class UnknownZoneError extends Error {
  constructor(public zone: string) { super(`Zona desconocida: ${zone}`); }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const routeRow = (r: { id: string; notes: string | null; status: string; disabledAt: Date | null; deletedAt: Date | null; createdAt: Date; updatedAt: Date }): RouteRow =>
  ({ id: r.id, notes: r.notes, status: r.status, disabledAt: iso(r.disabledAt), deletedAt: iso(r.deletedAt), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const hopRow = (h: { id: number; routeId: string; order: number; portalSize: number; expiresAt: Date; status: string; statusNote: string | null; deletedAt: Date | null; updatedAt: Date; fromZone: { name: string }; toZone: { name: string } }): HopRow =>
  ({ id: h.id, routeId: h.routeId, fromZone: h.fromZone.name, toZone: h.toZone.name, order: h.order, portalSize: h.portalSize, expiresAt: h.expiresAt.toISOString(), status: h.status, statusNote: h.statusNote, deletedAt: iso(h.deletedAt), updatedAt: h.updatedAt.toISOString() });

// Bajada: filas con updatedAt > since, ascendente. Si alguna lista supera
// `limit`, se recorta a las filas anteriores al último instante y `next`
// apunta ahí (el cliente repite con since=next).
export async function pullChanges(clanId: string, since: Date | null, limit = PULL_LIMIT): Promise<PullResult> {
  const serverTime = new Date();
  const changed = since ? { updatedAt: { gt: since } } : {};
  const [routes, hops] = await Promise.all([
    prisma.route.findMany({ where: { clanId, ...changed }, orderBy: { updatedAt: "asc" }, take: limit + 1 }),
    prisma.routeHop.findMany({
      where: { route: { clanId }, ...changed },
      orderBy: { updatedAt: "asc" },
      take: limit + 1,
      include: { fromZone: { select: { name: true } }, toZone: { select: { name: true } } },
    }),
  ]);
  const truncated = routes.length > limit || hops.length > limit;
  // Corte: el instante de la fila `limit`-ésima de la lista que desborda.
  // Se entregan las filas ANTERIORES al corte y `next` es el último
  // instante entregado: como `since` es exclusivo, la página siguiente
  // empieza justo en las filas del corte, sin perder ni repetir ninguna.
  let cutoff: Date | null = null;
  if (truncated) {
    const cut = (xs: { updatedAt: Date }[]) => (xs.length > limit ? xs[limit - 1].updatedAt : null);
    const candidates = [cut(routes), cut(hops)].filter((d): d is Date => d !== null);
    cutoff = new Date(Math.min(...candidates.map((d) => d.getTime())));
  }
  const keep = <T extends { updatedAt: Date }>(xs: T[]) => (cutoff ? xs.filter((x) => x.updatedAt < cutoff!) : xs);
  let keptRoutes = keep(routes);
  let keptHops = keep(hops);
  let next: Date | null = null;
  if (truncated) {
    if (keptRoutes.length + keptHops.length === 0) {
      // Todas las filas comparten el instante del corte: se entregan hasta
      // `limit` y se avanza el cursor (caso límite; ver spec §6.2).
      keptRoutes = routes.slice(0, limit);
      keptHops = hops.slice(0, limit);
      next = cutoff;
    } else {
      next = new Date(Math.max(...[...keptRoutes, ...keptHops].map((x) => x.updatedAt.getTime())));
    }
  }
  return { routes: keptRoutes.map(routeRow), hops: keptHops.map(hopRow), serverTime: serverTime.toISOString(), hasMore: truncated, next: next ? next.toISOString() : null };
}

export async function applyChanges(clanId: string, userId: string, batch: PushBatch): Promise<PushResult> {
  const applied: ChangeKey[] = [];
  const rejected: PushResult["rejected"] = [];

  // Zonas por nombre → id (400 si alguna no existe).
  const names = new Set<string>();
  for (const h of batch.hops) { names.add(h.fromZone); names.add(h.toZone); }
  const zones = await prisma.zone.findMany({ where: { name: { in: [...names] } }, select: { id: true, name: true } });
  const zoneId = new Map(zones.map((z) => [z.name, z.id]));
  for (const n of names) if (!zoneId.has(n)) throw new UnknownZoneError(n);

  // Dentro de un lote gana la última aparición de cada clave.
  const routesById = new Map(batch.routes.map((r) => [r.id, r]));
  const hopsByKey = new Map(batch.hops.map((h) => [`${h.routeId}|${h.fromZone}|${h.toZone}`, h]));
  const touchedRoutes = new Set<string>();

  for (const r of routesById.values()) {
    const key: ChangeKey = { kind: "route", id: r.id };
    const existing = await prisma.route.findUnique({ where: { id: r.id } });
    if (existing && existing.clanId !== clanId) { rejected.push({ key, reason: "not_in_map" }); continue; }
    if (!existing) {
      const created = await prisma.route.create({
        data: { id: r.id, clanId, createdById: userId, notes: r.notes ?? null, status: r.status ?? "ACTIVE", deletedAt: r.deletedAt ? new Date(r.deletedAt) : null },
      });
      await logAudit(clanId, userId, "ROUTE_CREATE", created.id, { via: "sync" });
      applied.push(key);
      continue;
    }
    if (!r.baseUpdatedAt || existing.updatedAt.toISOString() !== r.baseUpdatedAt) {
      rejected.push({ key, reason: "stale", server: routeRow(existing) });
      continue;
    }
    await prisma.route.update({
      where: { id: r.id },
      data: {
        notes: r.notes === undefined ? undefined : r.notes,
        status: r.status,
        disabledAt: r.status === "DISABLED" ? (existing.disabledAt ?? new Date()) : r.status === "ACTIVE" ? null : undefined,
        deletedAt: r.deletedAt === undefined ? undefined : r.deletedAt ? new Date(r.deletedAt) : null,
        version: { increment: 1 },
      },
    });
    touchedRoutes.add(r.id);
    applied.push(key);
  }

  for (const h of hopsByKey.values()) {
    const key: ChangeKey = { kind: "hop", routeId: h.routeId, fromZone: h.fromZone, toZone: h.toZone };
    const route = await prisma.route.findUnique({ where: { id: h.routeId }, select: { clanId: true } });
    if (!route || route.clanId !== clanId) { rejected.push({ key, reason: "not_in_map" }); continue; }
    const natural = { routeId: h.routeId, fromZoneId: zoneId.get(h.fromZone)!, toZoneId: zoneId.get(h.toZone)! };
    const existing = await prisma.routeHop.findUnique({
      where: { routeId_fromZoneId_toZoneId: natural },
      include: { fromZone: { select: { name: true } }, toZone: { select: { name: true } } },
    });
    const data = {
      order: h.order, portalSize: h.portalSize, expiresAt: new Date(h.expiresAt),
      status: h.status ?? "ACTIVE", statusNote: h.statusNote ?? null, deletedAt: h.deletedAt ? new Date(h.deletedAt) : null,
    };
    if (!existing) {
      await prisma.routeHop.create({ data: { ...natural, ...data } });
      touchedRoutes.add(h.routeId);
      applied.push(key);
      continue;
    }
    if (!h.baseUpdatedAt || existing.updatedAt.toISOString() !== h.baseUpdatedAt) {
      rejected.push({ key, reason: "stale", server: hopRow(existing) });
      continue;
    }
    const statusChanged = h.status !== undefined && h.status !== existing.status;
    await prisma.routeHop.update({
      where: { id: existing.id },
      data: { ...data, statusSetById: statusChanged ? userId : undefined, statusSetAt: statusChanged ? new Date() : undefined },
    });
    touchedRoutes.add(h.routeId);
    applied.push(key);
  }

  for (const routeId of touchedRoutes) await logAudit(clanId, userId, "ROUTE_UPDATE", routeId, { via: "sync" });
  return { applied, rejected, serverTime: new Date().toISOString() };
}
