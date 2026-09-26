"use client";
import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

type Share = { id: string; role: "VIEWER" | "EDITOR"; createdAt: string };

// Enlaces de ver/editar de un mapa personal (spec §5.3). El enlace recién
// creado se enseña una sola vez: la BD solo guarda su hash.
export function ShareLinksPanel({ clanId }: { clanId: string }) {
  const { t, lang } = useLanguage();
  const { data, mutate } = useSWR<{ shares: Share[] }>(`/api/v1/maps/${clanId}/shares`);
  const [fresh, setFresh] = useState<{ id: string; url: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(role: "VIEWER" | "EDITOR") {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/maps/${clanId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error?.message ?? t("toast.error"));
      setFresh({ id: body.id, url: body.url, role: body.role });
      await navigator.clipboard.writeText(body.url).then(() => toast.success(t("shareLinks.copied"))).catch(() => undefined);
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.error"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/v1/maps/${clanId}/shares/${id}`, { method: "DELETE" });
    if (r.ok) { if (fresh?.id === id) setFresh(null); mutate(); } else toast.error(t("toast.error"));
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{t("shareLinks.help")}</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => create("VIEWER")} className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50">{t("shareLinks.newView")}</button>
        <button disabled={busy} onClick={() => create("EDITOR")} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{t("shareLinks.newEdit")}</button>
      </div>
      {fresh && (
        <div className="rounded border border-indigo-700/60 bg-indigo-950/30 p-3 text-sm">
          <p className="text-slate-300">{t("shareLinks.once")}</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={fresh.url} data-testid="fresh-share-url" className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white" onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard.writeText(fresh.url).then(() => toast.success(t("shareLinks.copied")))} className="rounded bg-slate-700 px-2 text-xs text-white">⧉</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {(data?.shares ?? []).length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("shareLinks.empty")}</li>}
        {(data?.shares ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-xs ${s.role === "EDITOR" ? "bg-indigo-900 text-indigo-200" : "bg-slate-800 text-slate-300"}`}>{t(`share.role.${s.role}`)}</span>
            <span className="text-slate-400">{t("shareLinks.created", { date: fmt(s.createdAt) })}</span>
            <button onClick={() => revoke(s.id)} className="ml-auto text-xs text-red-300 hover:text-red-200">{t("shareLinks.revoke")}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
