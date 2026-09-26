"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { keepMapsWithDiscord } from "@/components/map/guest-actions";

// Convierte un mapa personal en mapa de clan (mismos requisitos que crear
// un clan: Vigil Bot en el servidor y ser owner/admin de ese Discord).
export function ConvertToClan({ clanId, isGuest, onDone }: { clanId: string; isGuest: boolean; onDone: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");
  const [guildName, setGuildName] = useState("");
  const [busy, setBusy] = useState(false);

  if (isGuest) {
    return (
      <div className="space-y-3 text-sm text-slate-300">
        <p>{t("convert.body")}</p>
        <p className="text-slate-400">{t("convert.guestFirst")}</p>
        <button onClick={() => keepMapsWithDiscord(`/clan/${clanId}/settings`)} className="rounded bg-[#5865F2] px-3 py-2 font-semibold text-white hover:bg-[#4752c4]">
          {t("nav.signInDiscord")}
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/clans/${clanId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, discordGuildId: guildId.trim(), discordGuildName: guildName }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? t("toast.error"));
      toast.success(t("convert.success"));
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.error"));
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white";
  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <p className="text-slate-300">{t("convert.body")}</p>
      <label className="block"><span className="text-slate-400">{t("convert.name")}</span>
        <input required minLength={3} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="block"><span className="text-slate-400">{t("createClan.fieldGuildId")} <span className="text-slate-500">({t("createClan.fieldGuildIdHint")})</span></span>
        <input required pattern="\d{17,20}" value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`${input} font-mono`} />
      </label>
      <label className="block"><span className="text-slate-400">{t("createClan.fieldGuildName")}</span>
        <input required maxLength={100} value={guildName} onChange={(e) => setGuildName(e.target.value)} className={input} />
      </label>
      <button disabled={busy} className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">{t("convert.submit")}</button>
    </form>
  );
}
