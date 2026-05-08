"use client";
import Image from "next/image";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ProfilePage() {
  const { me, mutate } = useMe();
  const [displayName, setDisplayName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();

  if (!me) return <div className="text-slate-400">{t("common.loading")}</div>;

  async function save() {
    setSaving(true);
    try {
      const val = displayName.trim() || null;
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: val }),
      });
      if (!res.ok) throw new Error(t("profile.saveError"));
      toast.success(t("toast.saved"));
      mutate();
      setDisplayName("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("toast.error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      <PageHeader>
        <h1 className="text-2xl font-bold text-white">{t("profile.title")}</h1>
      </PageHeader>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">{t("profile.identityTitle")}</h2>
        <div className="flex items-center gap-4">
          {me.image ? (
            <Image src={me.image} alt="" width={64} height={64} className="rounded-full" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-indigo-700" />
          )}
          <div>
            <div className="font-semibold text-white">{me.globalNickname ?? me.discordUsername}</div>
            <div className="text-sm text-slate-400">@{me.discordUsername}</div>
            <div className="font-mono text-xs text-slate-600">{me.discordId}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-white">{t("profile.displayNameTitle")}</h2>
        <p className="mb-3 text-sm text-slate-400">
          {t("profile.displayNameHelp")}
        </p>
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={me.displayName ?? t("profile.displayNamePlaceholderEmpty")}
            maxLength={40}
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >{t("common.save")}</button>
        </div>
      </section>
    </div>
  );
}
