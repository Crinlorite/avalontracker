import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { sendRouteToDiscord, sendImageToDiscord } from "@/lib/discord";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

// Discord rate-limita los webhooks (~5/2s) y bloquea el webhook si lo
// pasamos. 10/min por user es holgado para uso normal y evita que un
// usuario (o bot) tumbe el webhook del clan.
const pushLimiter = createLimiter({ windowMs: 60_000, max: 10 });

// headerText es texto libre que va en `content` del webhook (encima del
// embed). 100 chars es holgado para títulos tipo "Thetford Portal abierto".
const headerTextSchema = z.string().trim().max(100).optional();
// hopIds permite al cliente filtrar el embed a un subset del route —
// útil para routes con bifurcaciones internas, donde la lista en el
// frontend descompone la ruta en N caminos lineales y cada uno se
// envía a Discord por separado.
const hopIdsSchema = z.array(z.number().int()).max(50).optional();
// JSON body schema: usado cuando no hay imagen (compat hacia atrás).
const bodySchema = z.object({ headerText: headerTextSchema, hopIds: hopIdsSchema }).strict();
// Cap de imagen — coincide con el del helper de discord.ts.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;

  // El cliente puede mandar:
  //   - JSON: { headerText? } (sin imagen, compat con la versión anterior)
  //   - multipart/form-data: campos `headerText` y `image` (PNG)
  let headerText: string | undefined;
  let imageBytes: Uint8Array | null = null;
  let hopIds: number[] | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return apiError("VALIDATION_ERROR", 400, "FormData inválido");
    const ht = fd.get("headerText");
    const parsedHeader = headerTextSchema.safeParse(typeof ht === "string" ? ht : undefined);
    if (!parsedHeader.success) return apiError("VALIDATION_ERROR", 400, "headerText inválido");
    headerText = parsedHeader.data;
    const hids = fd.get("hopIds");
    if (typeof hids === "string" && hids.length > 0) {
      let parsed: unknown;
      try { parsed = JSON.parse(hids); } catch { return apiError("VALIDATION_ERROR", 400, "hopIds inválido"); }
      const validated = hopIdsSchema.safeParse(parsed);
      if (!validated.success) return apiError("VALIDATION_ERROR", 400, "hopIds inválido");
      hopIds = validated.data;
    }
    const img = fd.get("image");
    if (img instanceof Blob) {
      if (img.size > MAX_IMAGE_BYTES) {
        return apiError("VALIDATION_ERROR", 400, "Imagen demasiado grande (máx 8MB)");
      }
      // Defensa de tipo: validamos image/* pero dejamos pasar cualquier
      // formato que el navegador haya etiquetado como imagen. Discord
      // valida la extensión por sí mismo.
      if (img.type && !img.type.startsWith("image/")) {
        return apiError("VALIDATION_ERROR", 400, "Archivo no es imagen");
      }
      const ab = await img.arrayBuffer();
      imageBytes = new Uint8Array(ab);
    }
  } else {
    // Compat: body JSON (incluye request sin body).
    const raw = await req.text();
    if (raw.trim()) {
      let json: unknown;
      try { json = JSON.parse(raw); } catch { return apiError("VALIDATION_ERROR", 400, "JSON inválido"); }
      const parsed = bodySchema.safeParse(json);
      if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Body inválido", { issues: parsed.error.issues });
      headerText = parsed.data.headerText;
      hopIds = parsed.data.hopIds;
    }
  }

  try {
    await requireRole(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(pushLimiter, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { discordWebhookUrl: true },
  });
  if (!clan?.discordWebhookUrl) {
    return apiError("VALIDATION_ERROR", 400, "Este clan no tiene webhook Discord configurado");
  }

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: {
      // Hops vivos solamente — un push no incluye hops soft-deleted.
      hops: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        include: { fromZone: true, toZone: true },
      },
      createdBy: { select: { discordUsername: true, displayName: true, globalNickname: true } },
    },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");
  if (route.hops.length === 0) return apiError("VALIDATION_ERROR", 400, "La ruta no tiene hops");

  // Si el cliente indicó hopIds, filtramos al subset (preservando el
  // order original). Sirve para enviar un único path de una route con
  // bifurcaciones internas. Los IDs desconocidos se ignoran sin error
  // — no es un problema si el cliente y servidor están momentáneamente
  // desincronizados.
  let effectiveHops = route.hops;
  if (hopIds && hopIds.length > 0) {
    const wanted = new Set(hopIds);
    effectiveHops = route.hops.filter((h) => wanted.has(h.id));
    if (effectiveHops.length === 0) {
      return apiError("VALIDATION_ERROR", 400, "Ningún hop coincide con hopIds");
    }
  }

  const createdByName =
    route.createdBy.displayName ??
    route.createdBy.globalNickname ??
    route.createdBy.discordUsername;

  try {
    // Mensaje 1: header (si lo hay) + embed con la cadena.
    await sendRouteToDiscord(
      clan.discordWebhookUrl,
      {
        status: route.status,
        createdBy: createdByName,
        hops: effectiveHops.map((h) => ({
          fromZone: h.fromZone.name,
          toZone: h.toZone.name,
          portalSize: h.portalSize,
          expiresAt: h.expiresAt.toISOString(),
          status: h.status,
        })),
      },
      headerText,
    );

    // Mensaje 2: imagen (si el cliente la generó). Si falla, no
    // tumbamos el flujo entero — el primer mensaje ya llegó y el
    // usuario tiene la información esencial.
    let imageSent = false;
    let imageError: string | null = null;
    if (imageBytes) {
      try {
        await sendImageToDiscord(clan.discordWebhookUrl, imageBytes, "route.png");
        imageSent = true;
      } catch (e) {
        imageError = e instanceof Error ? e.message : "fallo al subir imagen";
      }
    }

    return NextResponse.json({ ok: true, imageSent, imageError });
  } catch (e) {
    return apiError("VALIDATION_ERROR", 400, e instanceof Error ? e.message : "Error enviando a Discord");
  }
}
