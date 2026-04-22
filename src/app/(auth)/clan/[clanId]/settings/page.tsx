"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import toast from "react-hot-toast";
import { useClan, type ClanAnchorZone } from "@/hooks/useClan";
import { useMe } from "@/hooks/useMe";
import { RoleMappingEditor } from "@/components/clan/RoleMappingEditor";
import { ZoneAutocomplete } from "@/components/zones/ZoneAutocomplete";
import { canAdmin } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function SettingsPage() {
  const { clanId } = useParams() as { clanId: string };
  const router = useRouter();
  const { clan, mutate } = useClan(clanId);
  const { me } = useMe();
  const { data: members = [], isLoading: membersLoading } = useSWR<MemberRow[]>(
    clanId ? `/api/clans/${clanId}/members` : null
  );
  const [name, setName] = useState("");
  const [webhook, setWebhook] = useState("");
  const [anchorSearch, setAnchorSearch] = useState("");
  const [saving, setSaving] = useState(false);

  if (!clan || !me || membersLoading) return <div className="text-slate-400">Cargando…</div>;

  // Gate de acceso: solo ADMIN del clan o super admin entran.
  const myRole = members.find((m) => m.userId === me.id)?.appRole ?? null;
  const allowed = canAdmin(myRole) || me.isSuperAdmin;

  if (!allowed) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-white">Configuración de {clan.name}</h1>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <div className="mx-auto mb-3 inline-block rounded-full bg-slate-800 px-3 py-1 text-xs uppercase text-slate-400">
            Acceso restringido
          </div>
          <p className="text-slate-300">
            La configuración del clan solo está disponible para el rol <strong>Admin</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Tu rol actual en este clan:{" "}
            <span className="text-slate-300">{myRole ?? "Sin rol"}</span>
          </p>
          <Link
            href={`/clan/${clanId}`}
            className="mt-6 inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Volver al grafo
          </Link>
        </div>
      </div>
    );
  }

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
        <AnchorPicker clanId={clanId} currentAnchor={clan.anchorZone ?? null} onUpdated={() => mutate()} />
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

function AnchorPicker({
  clanId, currentAnchor, onUpdated,
}: { clanId: string; currentAnchor: ClanAnchorZone | null; onUpdated: () => void }) {
  const [zoneName, setZoneName] = useState("");
  const [saving, setSaving] = useState(false);

  async function resolveZoneIdByName(name: string): Promise<number | null> {
    const res = await fetch(`/api/zones?q=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const zones = (await res.json()) as Array<{ id: number; name: string }>;
    const exact = zones.find((z) => z.name.toLowerCase() === name.toLowerCase());
    return exact?.id ?? null;
  }

  async function save(zoneId: number | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorZoneId: zoneId }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success(zoneId ? "Anchor actualizado" : "Anchor quitado");
      setZoneName("");
      onUpdated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function setAnchorFromName() {
    const trimmed = zoneName.trim();
    if (!trimmed) return toast.error("Escribe el nombre de una zona");
    const zoneId = await resolveZoneIdByName(trimmed);
    if (!zoneId) return toast.error(`No encuentro una zona llamada "${trimmed}". Usa el autocompletado y selecciona una sugerencia.`);
    await save(zoneId);
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
        <span className="text-slate-400">Anchor actual:</span>{" "}
        {currentAnchor ? (
          <span className="text-white">
            {currentAnchor.name}
            <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-200">{currentAnchor.type}</span>
            {currentAnchor.tier != null && (
              <span className="ml-1 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-200">T{currentAnchor.tier}</span>
            )}
          </span>
        ) : (
          <span className="italic text-slate-500">Sin configurar (el grafo centrará en la primera ruta activa)</span>
        )}
      </div>

      <div>
        <span className="text-xs text-slate-400">Nueva zona anchor</span>
        <div className="mt-1 flex gap-2">
          <div className="flex-1">
            <ZoneAutocomplete
              value={zoneName}
              onChange={setZoneName}
              placeholder="Escribe el nombre del HO, ciudad, etc. (p. ej. Bridgewatch)"
              disabled={saving}
            />
          </div>
          <button
            type="button"
            disabled={saving || !zoneName.trim()}
            onClick={setAnchorFromName}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Fijar
          </button>
          {currentAnchor && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Típicamente el HO Avalon del clan o la zona negra desde donde salen la mayoría de rutas. Es el nodo central del grafo.
        </p>
      </div>
    </div>
  );
}
