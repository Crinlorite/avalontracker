"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { signIn } from "next-auth/react";
import { ClanGraph } from "@/components/graph/ClanGraph";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ShareRole } from "@/lib/map-shares";
import { BrandMark } from "@/components/brand/BrandMark";

type Payload = { map: { id: string; name: string; anchorZone: ClanAnchorZone | null }; role: ShareRole; routes: RouteView[]; now: string };

export function SharedMap({ token, role, map, initial }: { token: string; role: ShareRole; map: Payload["map"]; initial: { routes: RouteView[]; now: string } }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useSWR<Payload>(`/api/v1/shares/${token}`, { fallbackData: { map, role, ...initial }, refreshInterval: 30_000, revalidateOnFocus: true });
  const routes = data?.routes ?? initial.routes;

  async function join() {
    setBusy(true); setError(null);
    try {
      let r = await fetch(`/api/v1/shares/${token}/join`, { method: "POST" });
      if (r.status === 401) {
        const s = await signIn("guest", { redirect: false });
        if (!s || s.error) { setError(t("map.start.rate")); return; }
        r = await fetch(`/api/v1/shares/${token}/join`, { method: "POST" });
      }
      if (!r.ok) { setError(t("toast.error")); return; }
      const { clanId } = await r.json();
      router.push(`/clan/${clanId}`); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-3">
        <Link href="/" className="mr-auto inline-flex items-center gap-2 font-semibold text-white"><BrandMark size={24} /> Avalon Tracker</Link>
        <span className="text-sm text-slate-400">{t("share.title")} · <strong className="text-white">{map.name}</strong> · {t(`share.role.${role}`)}</span>
        <button onClick={join} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
          {role === "EDITOR" ? t("share.join.edit") : t("share.join.save")}
        </button>
      </header>
      <p className="px-4 pt-2 text-xs text-slate-500">{t("share.readonly")} {t("share.join.hint")}</p>
      {error && <p role="alert" className="px-4 pt-2 text-sm text-red-300">{error}</p>}
      <div className="m-4 flex h-[70vh] min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-800">
        {routes.length === 0 ? <p className="p-6 text-slate-400">{t("share.empty")}</p> : (
          <ClanGraph clanId={`share:${token}`} routes={routes} anchor={map.anchorZone} onNodeClick={() => {}} />
        )}
      </div>
    </div>
  );
}
