"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { BrandMark } from "@/components/brand/BrandMark";

type Hop = { fromZone: string; toZone: string; portalSize: number; expiresAt: string; status: string; statusNote?: string };

function remaining(iso: string, now: number): string | null {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ImportRoute({ code, notes, hops, unsupported }: { code: string; notes: string | null; hops: Hop[]; unsupported: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);

  async function add() {
    setBusy(true); setError(null);
    try {
      const body = JSON.stringify({ code });
      const post = () => fetch("/api/v1/import", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      let r = await post();
      if (r.status === 401) {
        const s = await signIn("guest", { redirect: false });
        if (!s || s.error) { setError(t("map.start.rate")); return; }
        r = await post();
      }
      if (!r.ok) { setError(t("toast.error")); return; }
      const { clanId } = await r.json();
      router.push(`/clan/${clanId}`); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><BrandMark size={18} /> Avalon Tracker</Link>
        <h1 className="mt-3 text-2xl font-bold text-white">{t("import.title")}</h1>
        {unsupported ? <p className="mt-4 text-slate-300">{t("import.newer")}</p> : (<>
          {notes && <p className="mt-2 text-sm text-slate-400">{notes}</p>}
          <ol className="mt-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
            {hops.map((h, i) => { const left = remaining(h.expiresAt, now); return (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="text-white">{h.fromZone} → {h.toZone}</span>
                <span className="rounded bg-slate-800 px-1.5 text-xs text-slate-300">{h.portalSize}p</span>
                <span className={`ml-auto text-xs ${left ? "text-emerald-300" : "text-red-300"}`}>{left ? t("import.expiresIn", { time: left }) : t("import.expired")}</span>
              </li>); })}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={`avalontracker://r/${encodeURIComponent(code)}`} className="rounded-lg border border-indigo-500/60 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/20">{t("import.openApp")}</a>
            <button onClick={add} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">{t("import.add")}</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t("import.hint")}</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        </>)}
      </div>
    </main>
  );
}
