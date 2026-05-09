import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";

// POST /api/feedback
//
// Replica del endpoint de Royal Forge: recibe el form de feedback,
// verifica Turnstile, y reenvía a Vigil bot con project="avalontracker"
// para que genere ticket con prefix AT-XXXX.
//
// Env vars requeridas (Coolify env):
//   FEEDBACK_SECRET      compartido con Vigil bot (X-API-Key)
//   VIGIL_BOT_URL        https://vigilbot.app
//   TURNSTILE_SECRET     CF Turnstile secret key (server-side)

const MAX_TITLE = 200;
const MAX_DESC = 4000;
const MAX_EMAIL = 120;
const MAX_DISCORD = 40;
const MAX_CONTEXT_BYTES = 2000;

// "language" es nueva categoría que aún no existe en RF; se la
// pasamos al Vigil bot y debe tolerarla (o el bot la categoriza como
// "feature"/"other" hasta que se actualice). Coordinado en
// vigil-discordbot issue.
const TYPES = ["bug", "feature", "question", "language"] as const;

const bodySchema = z.object({
  type: z.enum(TYPES),
  title: z.string(),
  description: z.string(),
  email: z.string().nullable().optional(),
  discordUser: z.string().nullable().optional(),
  turnstileToken: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

async function verifyTurnstile(token: string | undefined, secret: string | undefined, ip: string | null) {
  if (!secret) return { success: true, skipped: true };
  if (!token) return { success: false };
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return { success: !!data.success };
  } catch {
    return { success: false };
  }
}

export async function POST(req: Request) {
  const FEEDBACK_SECRET = process.env.FEEDBACK_SECRET;
  const VIGIL_BOT_URL = process.env.VIGIL_BOT_URL;
  const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;

  if (!FEEDBACK_SECRET || !VIGIL_BOT_URL) {
    return apiError("INTERNAL", 500, "Feedback no configurado (FEEDBACK_SECRET o VIGIL_BOT_URL)");
  }

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Body inválido", { issues: parsed.error.issues });
  const body = parsed.data;

  const t = body.title.trim();
  const d = body.description.trim();
  if (t.length < 5 || t.length > MAX_TITLE) {
    return apiError("VALIDATION_ERROR", 400, `Título debe tener 5–${MAX_TITLE} chars`);
  }
  if (d.length < 20 || d.length > MAX_DESC) {
    return apiError("VALIDATION_ERROR", 400, `Descripción debe tener 20–${MAX_DESC} chars`);
  }
  if (body.email && (body.email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) {
    return apiError("VALIDATION_ERROR", 400, "Email inválido");
  }
  if (body.discordUser && body.discordUser.length > MAX_DISCORD) {
    return apiError("VALIDATION_ERROR", 400, "Usuario Discord demasiado largo");
  }

  let safeContext: Record<string, unknown> | undefined;
  if (body.context) {
    const serialized = JSON.stringify(body.context);
    if (serialized.length > MAX_CONTEXT_BYTES) {
      return apiError("VALIDATION_ERROR", 400, "Context demasiado grande");
    }
    safeContext = body.context;
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || null;
  const ts = await verifyTurnstile(body.turnstileToken, TURNSTILE_SECRET, ip);
  if (!ts.success) {
    return apiError("VALIDATION_ERROR", 400, "Anti-bot fallido");
  }

  // Forward al Vigil bot. Stripamos null/undefined opcionales — Zod
  // del bot espera `string | undefined`, no `string | null`.
  const forwardBody: Record<string, unknown> = {
    project: "avalontracker",
    type: body.type,
    title: t,
    description: d,
  };
  if (body.email)       forwardBody.email = body.email.trim();
  if (body.discordUser) forwardBody.discordUser = body.discordUser.trim();
  if (safeContext)      forwardBody.context = safeContext;

  let botResponse: Response;
  try {
    botResponse = await fetch(`${VIGIL_BOT_URL.replace(/\/$/, "")}/api/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FEEDBACK_SECRET,
        "X-Project": "avalontracker",
      },
      body: JSON.stringify(forwardBody),
    });
  } catch {
    return apiError("INTERNAL", 502, "Servicio de feedback no responde");
  }

  if (botResponse.status === 503) {
    return apiError("INTERNAL", 503, "Feedback temporalmente desactivado");
  }
  if (!botResponse.ok) {
    const text = await botResponse.text().catch(() => "");
    let detail: string | undefined;
    try { detail = JSON.parse(text).error; } catch { detail = text || undefined; }
    return apiError(
      "INTERNAL",
      botResponse.status >= 500 ? 502 : botResponse.status,
      detail || "Error al registrar ticket",
    );
  }

  let data: { publicId?: string; threadUrl?: string | null };
  try {
    data = await botResponse.json();
  } catch {
    return apiError("INTERNAL", 502, "Respuesta inválida del bot de feedback");
  }

  return NextResponse.json({
    publicId: data.publicId,
    threadUrl: data.threadUrl ?? null,
  });
}
