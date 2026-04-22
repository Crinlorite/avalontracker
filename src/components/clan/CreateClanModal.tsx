"use client";
import { useState } from "react";
import toast from "react-hot-toast";

export function CreateClanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");
  const [guildName, setGuildName] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      if (!res.ok) throw new Error(body?.error?.message ?? "Error al crear clan");
      toast.success("Clan creado");
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">Crear nuevo clan</h2>
        <p className="text-xs text-slate-400">
          <a
            href="https://vigil.crintech.pro"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline hover:text-indigo-300"
          >
            Vigil Bot
          </a>{" "}
          debe estar instalado en el servidor Discord antes de crear el clan.
        </p>

        <label className="block">
          <span className="text-sm text-slate-300">Nombre del clan</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={40}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Discord Guild ID</span>
          <input value={guildId} onChange={(e) => setGuildId(e.target.value)} required pattern="\d{17,20}" placeholder="Click derecho en el servidor → Copiar ID"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white" />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Nombre del servidor Discord</span>
          <input value={guildName} onChange={(e) => setGuildName(e.target.value)} required minLength={1} maxLength={100}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancelar</button>
          <button type="submit" disabled={submitting} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {submitting ? "Creando…" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
