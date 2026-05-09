"use client";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

export function CreateClanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");
  const [guildName, setGuildName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useLanguage();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/clans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, discordGuildId: guildId, discordGuildName: guildName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("createClan.errorGeneric"));
      toast.success(t("createClan.successToast"));
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("toast.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">{t("createClan.title")}</h2>
        <div className="space-y-2 rounded border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
          <p>
            {interpolate(t("createClan.requirementVigil"), {
              vigil: (
                <a
                  key="vigil"
                  href="https://vigilbot.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 underline hover:text-indigo-300"
                >
                  Vigil Bot
                </a>
              ),
            })}
          </p>
          <p>
            {interpolate(t("createClan.requirementOwner"), {
              owner: <strong key="owner">{t("createClan.requirementOwnerToken")}</strong>,
              admin: (
                <code key="admin" className="rounded bg-slate-800 px-1">Administrator</code>
              ),
              manage: (
                <code key="manage" className="rounded bg-slate-800 px-1">Manage Guild</code>
              ),
            })}
          </p>
        </div>

        <label className="block">
          <span className="text-sm text-slate-300">{t("createClan.fieldName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={40}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">{t("createClan.fieldGuildId")}</span>
          <input value={guildId} onChange={(e) => setGuildId(e.target.value)} required pattern="\d{17,20}" placeholder={t("createClan.fieldGuildIdHint")}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white" />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">{t("createClan.fieldGuildName")}</span>
          <input value={guildName} onChange={(e) => setGuildName(e.target.value)} required minLength={1} maxLength={100}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">{t("common.cancel")}</button>
          <button type="submit" disabled={submitting} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {submitting ? t("createClan.submitting") : t("createClan.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

// Sustituye {token} en una cadena traducida por nodos React. Necesario
// porque <a>, <strong> y <code> embebidos no caben en un t() plano.
function interpolate(template: string, slots: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    if (!m) return <span key={`t${i}`}>{part}</span>;
    return slots[m[1]] ?? part;
  });
}
