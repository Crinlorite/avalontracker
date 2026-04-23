"use client";
import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";

type TokenRow = {
  id: string; label: string;
  targetClan: { id: string; name: string };
  createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
type CreatedToken = { id: string; label: string; raw: string; targetClanId: string };
type AdminClan = { id: string; name: string };

export default function IngestTokensPage() {
  const { data: tokens = [], mutate } = useSWR<TokenRow[]>("/api/admin/ingest-tokens");
  const { data: clans = [] } = useSWR<AdminClan[]>("/api/admin/clans");

  const [label, setLabel] = useState("");
  const [clanId, setClanId] = useState("");
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ingest-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, targetClanId: clanId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Error creando token");
      setJustCreated(body);
      setLabel("");
      setClanId("");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("¿Revocar este token? Loot Vigil dejará de poder enviar eventos hasta que pongas uno nuevo.")) return;
    const res = await fetch(`/api/admin/ingest-tokens/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Token revocado"); mutate(); }
    else toast.error("Error al revocar");
  }

  async function copy(raw: string) {
    try {
      await navigator.clipboard.writeText(raw);
      toast.success("Copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar — selecciona y copia manual");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ingest tokens</h1>
        <p className="mt-1 text-sm text-slate-400">
          Tokens personales para autorizar Loot Vigil (u otros sniffers) a ingestar eventos de zona. Solo super admin.
          Una vez creado el token en claro se muestra <strong>una sola vez</strong> — cópialo a settings.json de Loot Vigil y si lo pierdes genera otro.
        </p>
      </div>

      {justCreated && (
        <div className="rounded-lg border-2 border-amber-600 bg-amber-950/40 p-4">
          <h2 className="text-sm font-bold uppercase text-amber-400">⚠ Guarda este token ahora</h2>
          <p className="mt-1 text-xs text-amber-200">
            No volverá a mostrarse. Pégalo en <code className="rounded bg-slate-900 px-1">settings.json</code> de Loot Vigil como <code className="rounded bg-slate-900 px-1">avalonIngestToken</code>.
          </p>
          <div className="mt-3 flex gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-slate-950 px-3 py-2 font-mono text-xs text-amber-100">
              {justCreated.raw}
            </code>
            <button
              onClick={() => copy(justCreated.raw)}
              className="rounded bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600"
            >
              Copiar
            </button>
            <button
              onClick={() => setJustCreated(null)}
              className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
            >
              Ya lo tengo
            </button>
          </div>
        </div>
      )}

      <form onSubmit={createToken} className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-bold uppercase text-slate-300">Generar nuevo token</h2>
        <label className="block">
          <span className="text-xs uppercase text-slate-400">Etiqueta</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ej. PC sobremesa"
            required minLength={1} maxLength={60}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase text-slate-400">Clan destino</span>
          <select
            value={clanId}
            onChange={(e) => setClanId(e.target.value)}
            required
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            <option value="">— elegir clan —</option>
            {clans.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting || !label || !clanId}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? "Generando…" : "Generar token"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Etiqueta</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Clan destino</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creado</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Último uso</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Estado</th>
              <th className="px-3 py-2 text-right text-xs uppercase text-slate-400">•</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tokens.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Aún no hay tokens.</td></tr>
            )}
            {tokens.map((t) => (
              <tr key={t.id} className={t.revokedAt ? "opacity-40" : ""}>
                <td className="px-3 py-2 text-white">{t.label}</td>
                <td className="px-3 py-2 text-slate-300">{t.targetClan.name}</td>
                <td className="px-3 py-2 text-slate-400">{new Date(t.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-3 py-2 text-slate-400">{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                <td className="px-3 py-2">
                  {t.revokedAt
                    ? <span className="rounded bg-red-900/40 px-2 py-0.5 text-xs text-red-300">Revocado</span>
                    : <span className="rounded bg-green-900/40 px-2 py-0.5 text-xs text-green-300">Activo</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {!t.revokedAt && (
                    <button
                      onClick={() => revoke(t.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Revocar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
