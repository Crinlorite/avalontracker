"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useClan } from "@/hooks/useClan";
import { RoleMappingEditor } from "@/components/clan/RoleMappingEditor";

export default function SettingsPage() {
  const { clanId } = useParams() as { clanId: string };
  const router = useRouter();
  const { clan, mutate } = useClan(clanId);
  const [name, setName] = useState("");
  const [webhook, setWebhook] = useState("");
  const [anchorSearch, setAnchorSearch] = useState("");
  const [saving, setSaving] = useState(false);

  if (!clan) return <div className="text-slate-400">Cargando…</div>;

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Guardado");
      mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    const res = await fetch(`/api/clans/${clanId}/webhook-test`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Mensaje enviado a Discord");
    else toast.error(body?.error?.message ?? "Error en webhook");
  }

  async function deleteClan() {
    if (!confirm(`Escribe el nombre exacto (${clan?.name}) para confirmar`)) return;
    const res = await fetch(`/api/clans/${clanId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Clan eliminado"); router.push("/dashboard"); }
    else toast.error("Error al borrar");
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-white">Configuración de {clan.name}</h1>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Identidad</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-slate-300">Nombre</span>
            <div className="mt-1 flex gap-2">
              <input defaultValue={clan.name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              <button disabled={!name || saving} onClick={() => save({ name })} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Guardar</button>
            </div>
          </label>
          <div>
            <span className="text-sm text-slate-300">Guild Discord</span>
            <div className="mt-1 rounded border border-slate-700 bg-slate-950 px-3 py-2">
              <div className="text-white">{clan.discordGuildName}</div>
              <div className="font-mono text-xs text-slate-500">{clan.discordGuildId}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Webhook Discord</h2>
        <div className="space-y-3">
          <input
            defaultValue={clan.discordWebhookUrl ?? ""}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
          />
          <div className="flex gap-2">
            <button disabled={saving} onClick={() => save({ discordWebhookUrl: webhook || null })} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">Guardar</button>
            <button disabled={!clan.discordWebhookUrl} onClick={testWebhook} className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Probar</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Zona anchor (centro del grafo)</h2>
        <AnchorPicker clanId={clanId} currentAnchorId={clan.anchorZoneId} onUpdated={() => mutate()} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Mapeo de roles Discord</h2>
        <RoleMappingEditor clanId={clanId} />
      </section>

      <section className="rounded-xl border border-red-900/50 bg-red-950/30 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-200">Zona peligrosa</h2>
        <p className="mb-3 text-sm text-red-300">Eliminar el clan borra todas sus rutas, miembros y mappings. No se puede deshacer.</p>
        <button onClick={deleteClan} className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Eliminar clan</button>
      </section>
    </div>
  );
}

function AnchorPicker({ clanId, currentAnchorId, onUpdated }: { clanId: string; currentAnchorId: number | null; onUpdated: () => void }) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function pick(zoneId: number | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorZoneId: zoneId }),
      });
      if (!res.ok) throw new Error("Error");
      toast.success("Anchor actualizado");
      onUpdated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // Simplified inline search: link to members-style selector would be cleaner;
  // dejamos picker simple: quitarlo o introducir ID manual.
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-400">Zona anchor actual: {currentAnchorId ?? "sin configurar"}</div>
      <div className="flex gap-2">
        <input type="number" placeholder="Zone ID (de /api/zones?q=)" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        <button disabled={saving || !search} onClick={() => pick(Number(search))} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Fijar</button>
        <button disabled={saving || !currentAnchorId} onClick={() => pick(null)} className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Quitar</button>
      </div>
      <p className="text-xs text-slate-500">El selector pro vendrá con ZoneAutocomplete en una fase posterior.</p>
    </div>
  );
}
