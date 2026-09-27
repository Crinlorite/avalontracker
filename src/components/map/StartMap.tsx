"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { BrandMark } from "@/components/brand/BrandMark";

// Crea un mapa personal. Sin sesión, primero crea la cuenta de invitado
// (un clic: los rastreadores no crean cuentas al visitar /map).
export function StartMap({ signedIn, fromZone }: { signedIn: boolean; fromZone?: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (!signedIn) {
        const r = await signIn("guest", { redirect: false });
        if (!r || r.error) { setError(t("map.start.rate")); return; }
      }
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fromZone ? { anchorZone: fromZone } : {}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.limit ? t("map.start.limit") : t("map.start.error"));
        return;
      }
      router.push(`/clan/${body.id}`);
      router.refresh();
    } catch {
      setError(t("map.start.error"));
    } finally {
      setBusy(false);
    }
  }

  const [pre, post] = t("map.start.terms").split("{privacy}");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><BrandMark size={18} /> Avalon Tracker</Link>
        <h1 className="mt-4 text-2xl font-bold text-white md:text-3xl">{t("map.start.title")}</h1>
        <p className="mt-3 text-slate-300">{t("map.start.body")}</p>
        {fromZone && <p className="mt-3 text-sm text-indigo-300">{t("map.start.from", { zone: fromZone })}</p>}
        <button
          onClick={start}
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? t("map.start.creating") : t("map.start.cta")}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
        <p className="mt-4 text-xs text-slate-500">
          {pre}<Link href="/legal/privacy" className="underline hover:text-slate-300">{t("map.start.privacy")}</Link>{post}
        </p>
      </div>
    </main>
  );
}
