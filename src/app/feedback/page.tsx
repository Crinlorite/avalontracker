"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

const APP_VERSION = "1.0";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

// Categorías replicando Royal Forge + nueva "language" (errores/falta
// de traducción) que aún no está implementada en RF — la añadimos
// aquí primero, RF la heredará cuando aplique.
const TYPES = [
  { id: "bug",      icon: "🐛", labelEn: "Bug",       labelEs: "Bug",         descEn: "Something is broken",   descEs: "Algo no funciona" },
  { id: "feature",  icon: "✨", labelEn: "Feature",   labelEs: "Sugerencia",  descEn: "Idea or improvement",   descEs: "Idea o mejora" },
  { id: "question", icon: "💬", labelEn: "Question",  labelEs: "Pregunta",    descEn: "How does X work?",      descEs: "¿Cómo funciona X?" },
  { id: "language", icon: "🌐", labelEn: "Language",  labelEs: "Idioma",      descEn: "Translation issue",     descEs: "Error de traducción" },
] as const;

type FeedbackType = typeof TYPES[number]["id"];

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

export default function FeedbackPage() {
  const { lang } = useLanguage();
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [discordUser, setDiscordUser] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [turnstileToken, setTurnstileToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; publicId?: string; threadUrl?: string | null; silent?: boolean } | null>(null);

  // Turnstile widget render (anti-bot de Cloudflare).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

    function renderWidget() {
      if (!window.turnstile || !turnstileRef.current || widgetIdRef.current !== null) return;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (token: string) => setTurnstileToken(token),
        "error-callback": () => setTurnstileToken(""),
        "expired-callback": () => setTurnstileToken(""),
      });
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.querySelector(`script[src^="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", renderWidget, { once: true });
      } else {
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.onload = renderWidget;
        document.head.appendChild(s);
      }
    }

    return () => {
      if (window.turnstile && widgetIdRef.current !== null) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
  }, []);

  const resetTurnstile = useCallback(() => {
    if (window.turnstile && widgetIdRef.current !== null) {
      try { window.turnstile.reset(widgetIdRef.current); } catch { /* ignore */ }
    }
    setTurnstileToken("");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Honeypot: bots rellenan el campo invisible.
    if (website) {
      setResult({ ok: true, publicId: "AT-XXXX", threadUrl: null, silent: true });
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    if (trimmedTitle.length < 5) {
      toast.error(lang === "es" ? "El título debe tener al menos 5 caracteres" : "Title must be at least 5 characters");
      return;
    }
    if (trimmedDesc.length < 20) {
      toast.error(lang === "es" ? "La descripción debe tener al menos 20 caracteres" : "Description must be at least 20 characters");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      toast.error(lang === "es" ? "Completa la verificación anti-bot" : "Please complete the anti-bot check");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: trimmedTitle,
          description: trimmedDesc,
          email: email.trim() || null,
          discordUser: discordUser.trim() || null,
          turnstileToken,
          context: {
            lang,
            version: APP_VERSION,
            userAgent: navigator.userAgent.slice(0, 200),
          },
        }),
      });

      if (res.status === 503) {
        toast.error(lang === "es"
          ? "El feedback está temporalmente deshabilitado. Inténtalo más tarde."
          : "Feedback is temporarily disabled. Please try again later.");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error?.message || body.error || (lang === "es" ? "Error al enviar." : "Failed to send."));
        resetTurnstile();
        setSubmitting(false);
        return;
      }

      const data = await res.json();
      setResult({ ok: true, ...data });
      setTitle("");
      setDescription("");
      setEmail("");
      setDiscordUser("");
      resetTurnstile();
    } catch {
      toast.error(lang === "es" ? "Error de red." : "Network error.");
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok && !result.silent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-xl border border-emerald-700/50 bg-emerald-900/10 p-8 text-center">
          <div className="text-5xl">✔</div>
          <h1 className="mt-4 text-2xl font-bold text-white">
            {lang === "es" ? "¡Gracias!" : "Thank you!"}
          </h1>
          <p className="mt-2 text-slate-300">
            {lang === "es" ? "Tu ticket ha sido registrado." : "Your ticket has been registered."}
          </p>
          <div className="mt-4 inline-block rounded bg-slate-900 px-4 py-2 font-mono text-lg text-emerald-300">
            {result.publicId}
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {lang === "es"
              ? (email ? "Te avisaremos por email cuando trabajemos en ello." : "Guarda este ID si quieres seguir el progreso.")
              : (email ? "We will email you when we work on it." : "Save this ID if you want to track progress.")}
          </p>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="mt-6 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            {lang === "es" ? "Enviar otro" : "Submit another"}
          </button>
        </div>
      </div>
    );
  }

  if (result?.silent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-emerald-300">{lang === "es" ? "Recibido." : "Received."}</p>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-4 rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
        >
          {lang === "es" ? "Volver" : "Back"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          {lang === "es" ? "Enviar Feedback" : "Send Feedback"}
        </h1>
        <p className="mt-2 text-slate-400">
          {lang === "es"
            ? "Reporta bugs, sugiere mejoras o haz preguntas. Los tickets se gestionan en nuestro Discord."
            : "Report bugs, suggest improvements or ask questions. Tickets are managed on our Discord."}
        </p>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Type selector */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((tt) => (
            <button
              key={tt.id}
              type="button"
              onClick={() => setType(tt.id)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                type === tt.id
                  ? "border-indigo-500 bg-indigo-950/40"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}
            >
              <div className="text-2xl">{tt.icon}</div>
              <div className="mt-1 text-sm font-semibold text-white">
                {lang === "es" ? tt.labelEs : tt.labelEn}
              </div>
              <div className="text-[11px] text-slate-400">
                {lang === "es" ? tt.descEs : tt.descEn}
              </div>
            </button>
          ))}
        </div>

        {/* Title */}
        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            {lang === "es" ? "Título" : "Title"} <span className="text-red-400">*</span>
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder={lang === "es" ? "Breve resumen del tema" : "Brief summary of the issue"}
            required
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <span className="mt-1 block text-right text-[10px] text-slate-500">{title.length}/200</span>
        </label>

        {/* Description */}
        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            {lang === "es" ? "Descripción" : "Description"} <span className="text-red-400">*</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={8}
            placeholder={lang === "es"
              ? "Pasos para reproducir, lo que esperabas, lo que pasó..."
              : "Steps to reproduce, what you expected, what happened..."}
            required
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <span className="mt-1 block text-right text-[10px] text-slate-500">{description.length}/4000</span>
        </label>

        {/* Contact (optional) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              Email <span className="text-slate-500">({lang === "es" ? "opcional" : "optional"})</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              placeholder="your@email.com"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-300">
              {lang === "es" ? "Usuario Discord" : "Discord username"} <span className="text-slate-500">({lang === "es" ? "opcional" : "optional"})</span>
            </span>
            <input
              type="text"
              value={discordUser}
              onChange={(e) => setDiscordUser(e.target.value)}
              maxLength={40}
              placeholder="yourname"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
        </div>

        <p className="text-xs text-slate-500">
          {lang === "es"
            ? "Te avisaremos cuando tu ticket se resuelva (email o DM en Discord). Si no dejas nada, queda anónimo."
            : "We'll notify you when your ticket is resolved (email or Discord DM). Leave blank to stay anonymous."}
        </p>

        {/* Honeypot */}
        <div className="absolute left-[-10000px] h-px w-px overflow-hidden" aria-hidden="true">
          <label>Website (leave empty)</label>
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Turnstile */}
        {TURNSTILE_SITE_KEY ? (
          <div ref={turnstileRef}></div>
        ) : (
          <p className="text-xs italic text-amber-400">
            {lang === "es" ? "(Anti-bot no configurado en este entorno)" : "(Anti-bot not configured in this environment)"}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
          className="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting
            ? (lang === "es" ? "Enviando…" : "Sending…")
            : (lang === "es" ? "Enviar ticket" : "Submit ticket")}
        </button>
      </form>
    </div>
  );
}
