import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { isDiscordWebhookUrl } from "@/lib/webhook-url";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

// Combinado con la validación isDiscordWebhookUrl, evita que el endpoint
// se use como port-scanner. Aún así limitamos a 5/min para evitar abuse.
const testLimiter = createLimiter({ windowMs: 60_000, max: 5 });

type RouteParams = { params: Promise<{ clanId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRole(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const rl = consumeToken(testLimiter, session.user.id);
  if (!rl.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: rl.retryAfterMs });

  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { discordWebhookUrl: true } });
  if (!clan?.discordWebhookUrl) return apiError("VALIDATION_ERROR", 400, "Webhook no configurado");

  // Anti-SSRF: descarta cualquier URL que no sea Discord (defensa en
  // profundidad por si en BD hay un valor antiguo sin validar).
  if (!isDiscordWebhookUrl(clan.discordWebhookUrl)) {
    return apiError("VALIDATION_ERROR", 400, "Webhook no válido");
  }

  try {
    const res = await fetch(clan.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "🧪 Test desde Avalon Tracker — webhook funcionando." }),
    });
    if (!res.ok) return apiError("VALIDATION_ERROR", 400, `Webhook respondió ${res.status}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
