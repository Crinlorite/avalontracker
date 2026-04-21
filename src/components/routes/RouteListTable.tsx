"use client";
import { useState } from "react";
import { secondsLeft, formatCountdown, colorForMinutes, minutesLeft } from "@/lib/time";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { AppRole } from "@/generated/prisma/client";
import { canCreate, canDelete } from "@/lib/role-ui";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import { CreateRouteModal } from "./CreateRouteModal";
import { useParams } from "next/navigation";

export function RouteListTable({ routes, myRole }: { routes: RouteView[]; myRole: AppRole | null }) {
  const { clanId } = useParams() as { clanId: string };
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Rutas ({routes.length})</h1>
        {canCreate(myRole) && (
          <button onClick={() => setShowCreate(true)} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Nueva</button>
        )}
      </div>

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
                {(canCreate(myRole) || canDelete(myRole)) && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {routes.map((r) => {
                const nextExpiry = r.hops.filter((h) => h.status === "ACTIVE").sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
                const mins = nextExpiry ? minutesLeft(nextExpiry.expiresAt) : -1;
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
                    {(canCreate(myRole) || canDelete(myRole)) && (
                      <td className="px-3 py-3 text-right">
                        {canCreate(myRole) && <button onClick={() => disable(r.id, r.version)} className="mr-2 text-xs text-yellow-400 hover:text-yellow-300">Disable</button>}
                        {canDelete(myRole) && <button onClick={() => del(r.id)} className="text-xs text-red-400 hover:text-red-300">Borrar</button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateRouteModal clanId={clanId} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
    </div>
  );
}
