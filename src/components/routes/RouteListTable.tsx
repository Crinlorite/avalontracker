"use client";
import { useState } from "react";
import { secondsLeft, formatCountdown, colorForMinutes, minutesLeft } from "@/lib/time";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { AppRole } from "@/generated/prisma/client";
import { canCreate, canDelete } from "@/lib/role-ui";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import { AppendHopModal } from "./AppendHopModal";
import { MergeRoutesModal } from "./MergeRoutesModal";
import { useParams } from "next/navigation";

export function RouteListTable({ routes, myRole }: { routes: RouteView[]; myRole: AppRole | null }) {
  const { clanId } = useParams() as { clanId: string };
  const [appendTo, setAppendTo] = useState<RouteView | null>(null);
  const [mergeInto, setMergeInto] = useState<RouteView | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushTarget, setPushTarget] = useState<RouteView | null>(null);
  const [headerDraft, setHeaderDraft] = useState("");

  async function disable(routeId: string, version: number) {
    const res = await fetch(`/api/clans/${clanId}/routes/${routeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": `v=${version}` },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    if (res.ok) { toast.success("Ruta deshabilitada"); globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`)); }
    else if (res.status === 409) toast.error("Otro miembro editó esto; recarga");
    else toast.error("Error");
  }

  async function del(routeId: string) {
    if (!confirm("¿Borrar permanentemente?")) return;
    const res = await fetch(`/api/clans/${clanId}/routes/${routeId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Borrado"); globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`)); }
    else toast.error("Error");
  }

  async function confirmPush() {
    if (!pushTarget) return;
    const routeId = pushTarget.id;
    const header = headerDraft.trim();
    setPushingId(routeId);
    setPushTarget(null);
    setHeaderDraft("");
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/discord-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(header ? { headerText: header } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) toast.success("Enviada a Discord");
      else toast.error(body?.error?.message ?? "Error enviando a Discord");
    } catch {
      toast.error("Error de red");
    } finally {
      setPushingId(null);
    }
  }

  const canEdit = canCreate(myRole);
  const canDel = canDelete(myRole);
  const canMerge = canDel; // Merge requiere EDITOR+ (borra la ruta source).
  const hasActions = canEdit || canDel;

  return (
    <div className="space-y-4">
      {routes.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Sin rutas activas.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Cadena</th>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creada por</th>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Próximo vencimiento</th>
                {hasActions && <th className="px-3 py-2 text-right text-xs uppercase text-slate-400">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {routes.map((r) => {
                const nextExpiry = r.hops.filter((h) => h.status === "ACTIVE").sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
                const mins = nextExpiry ? minutesLeft(nextExpiry.expiresAt) : -1;
                const canAppend = canEdit && r.hops.length < 12;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1 text-sm">
                        {r.hops.map((h, i) => (
                          <span key={h.id} className="flex items-center gap-1">
                            {i === 0 && <span className="text-white">{h.fromZone.name}</span>}
                            <span className="text-slate-500">→</span>
                            <span className="text-white">{h.toZone.name}</span>
                            <span className="rounded bg-slate-800 px-1 text-[10px] text-slate-300">{h.portalSize}</span>
                          </span>
                        ))}
                      </div>
                      {r.notes && <div className="mt-1 text-xs italic text-slate-500">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-3 text-slate-300">{r.createdBy.displayName ?? r.createdBy.globalNickname ?? r.createdBy.discordUsername}</td>
                    <td className="px-3 py-3">
                      {nextExpiry ? (
                        <span style={{ color: colorForMinutes(mins) }} className="font-mono">
                          {formatCountdown(secondsLeft(nextExpiry.expiresAt))}
                        </span>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    {hasActions && (
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {canEdit && (
                            <button
                              onClick={() => { setPushTarget(r); setHeaderDraft(""); }}
                              disabled={pushingId === r.id}
                              className="rounded bg-indigo-600/80 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
                              title="Enviar ruta al canal Discord del clan"
                            >
                              {pushingId === r.id ? "…" : "📨 Discord"}
                            </button>
                          )}
                          {canAppend && (
                            <button
                              onClick={() => setAppendTo(r)}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                              title="Añadir hop al final de la ruta"
                            >
                              + Hop
                            </button>
                          )}
                          {canMerge && routes.length > 1 && (
                            <button
                              onClick={() => setMergeInto(r)}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                              title="Fusionar otra ruta dentro de esta"
                            >
                              ⛓ Fusionar
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => disable(r.id, r.version)} className="text-xs text-yellow-400 hover:text-yellow-300">
                              Disable
                            </button>
                          )}
                          {canDel && (
                            <button onClick={() => del(r.id)} className="text-xs text-red-400 hover:text-red-300">
                              Borrar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {appendTo && (
        <AppendHopModal
          clanId={clanId}
          route={appendTo}
          onClose={() => setAppendTo(null)}
          onAdded={() => setAppendTo(null)}
        />
      )}
      {mergeInto && (
        <MergeRoutesModal
          clanId={clanId}
          targetRoute={mergeInto}
          candidateRoutes={routes.filter((r) => r.id !== mergeInto.id)}
          onClose={() => setMergeInto(null)}
          onMerged={() => setMergeInto(null)}
        />
      )}

      {pushTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setPushTarget(null); setHeaderDraft(""); }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); confirmPush(); }}
            className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
          >
            <h2 className="text-lg font-bold text-white">Enviar a Discord</h2>
            <p className="text-xs text-slate-400">
              Aparecerá como mensaje encima del embed de la ruta. Déjalo vacío si no quieres encabezado.
            </p>
            <label className="block">
              <span className="text-sm text-slate-300">Encabezado (opcional)</span>
              <input
                autoFocus
                value={headerDraft}
                onChange={(e) => setHeaderDraft(e.target.value)}
                maxLength={100}
                placeholder="Ej: Thetford Portal"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <span className="mt-1 block text-right text-[10px] text-slate-500">{headerDraft.length}/100</span>
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => { setPushTarget(null); setHeaderDraft(""); }}
                className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Enviar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
