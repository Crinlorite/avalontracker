"use client";
import { useParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import toast from "react-hot-toast";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import { canDelete } from "@/lib/role-ui";
import { PageHeader } from "@/components/layout/PageHeader";
import type { AppRole } from "@/generated/prisma/client";

type ZoneInfo = {
  id: number;
  name: string;
  type: string;
  tier: number | null;
  hasHideout: boolean;
  isRest: boolean;
};
type TrashHop = {
  id: number;
  order: number;
  portalSize: number;
  expiresAt: string;
  deletedAt: string;
  fromZone: ZoneInfo;
  toZone: ZoneInfo;
};
type TrashEvent = {
  routeId: string;
  routeNotes: string | null;
  routeStatus: string;
  createdBy: string;
  deletedAt: string;
  expiresAt: string; // hard-delete time
  remainingMs: number;
  hops: TrashHop[];
};
type TrashResponse = { events: TrashEvent[]; now: string };
type MemberRow = { userId: string; appRole: AppRole | null };

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expira ahora";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h restantes`;
  if (hours > 0) return `${hours}h ${mins}m restantes`;
  return `${mins}m restantes`;
}

// Color del countdown: verde si > 24h, ámbar 4-24h, rojo si <4h.
function colorForRemaining(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 4) return "#ef4444";
  if (hours < 24) return "#f59e0b";
  return "#22c55e";
}

export default function TrashPage() {
  const { clanId } = useParams() as { clanId: string };
  const { me } = useMe();
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const myRole = members.find((m) => m.userId === me?.id)?.appRole ?? null;
  const canRestore = canDelete(myRole); // mismo umbral que borrar

  const { data, error, isLoading } = useSWR<TrashResponse>(
    clanId ? `/api/clans/${clanId}/trash` : null,
    { refreshInterval: 30_000 }, // refresca el countdown cada 30s
  );
  const [restoringKey, setRestoringKey] = useState<string | null>(null);

  async function restore(ev: TrashEvent) {
    const key = `${ev.routeId}:${ev.deletedAt}`;
    setRestoringKey(key);
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${ev.routeId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hopIds: ev.hops.map((h) => h.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error?.message ?? "Error al restaurar");
        return;
      }
      toast.success(
        body?.reactivated
          ? "Restaurado y reactivado a ACTIVE"
          : `Restaurado (${body?.restored ?? ev.hops.length} hop${ev.hops.length > 1 ? "s" : ""})`,
      );
      globalMutate(`/api/clans/${clanId}/trash`);
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
    } catch {
      toast.error("Error de red");
    } finally {
      setRestoringKey(null);
    }
  }

  if (isLoading) return <div className="text-slate-400">Cargando papelera…</div>;
  if (error) return <div className="text-red-400">Error cargando la papelera</div>;
  const events = data?.events ?? [];

  return (
    <div className="space-y-4">
      <PageHeader>
        <h1 className="text-2xl font-bold text-white">Papelera</h1>
        <p className="text-sm text-slate-400">
          Rutas y caminos borrados (manual o por caducidad de toda la chain). Se eliminan
          definitivamente tras 2 días desde el borrado. Antes de eso, puedes restaurarlos.
        </p>
      </PageHeader>

      {events.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          Papelera vacía 🗑️
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const key = `${ev.routeId}:${ev.deletedAt}`;
            const remainingColor = colorForRemaining(ev.remainingMs);
            const isExpired = ev.routeStatus === "EXPIRED";
            return (
              <div
                key={key}
                className="rounded-lg border border-slate-800 bg-slate-900 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Cadena de zonas */}
                    <div className="flex flex-wrap items-center gap-1 text-sm">
                      {ev.hops.map((h, i) => (
                        <span key={h.id} className="flex items-center gap-1">
                          {i === 0 && <span className="text-white">{h.fromZone.name}</span>}
                          <span className="text-slate-500">→</span>
                          <span className="text-white">{h.toZone.name}</span>
                          <span className="rounded bg-slate-800 px-1 text-[10px] text-slate-300">
                            {h.portalSize}p
                          </span>
                        </span>
                      ))}
                    </div>
                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        Borrada{" "}
                        {new Date(ev.deletedAt).toLocaleString("es-ES", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      <span>
                        Origen: <span className="text-slate-300">{ev.createdBy}</span>
                      </span>
                      {isExpired && (
                        <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-300">
                          chain caducada
                        </span>
                      )}
                      {ev.routeNotes && (
                        <span className="italic">&ldquo;{ev.routeNotes}&rdquo;</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="font-mono text-xs"
                      style={{ color: remainingColor }}
                      title={`Hard-delete: ${new Date(ev.expiresAt).toLocaleString("es-ES")}`}
                    >
                      {formatRemaining(ev.remainingMs)}
                    </span>
                    {canRestore && (
                      <button
                        onClick={() => restore(ev)}
                        disabled={restoringKey === key || ev.remainingMs <= 0}
                        className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                        title="Restaurar (deshacer borrado)"
                      >
                        {restoringKey === key ? "…" : "↩ Restaurar"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
