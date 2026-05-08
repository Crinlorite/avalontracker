"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import type { HopView } from "@/hooks/useClanRoutes";
import type { AppRole } from "@/generated/prisma/client";
import { canCreate, canDelete } from "@/lib/role-ui";

export function HopInlineToolbar({
  clanId, routeId, hop, myRole,
}: { clanId: string; routeId: string; hop: HopView; myRole: AppRole | null }) {
  const [busy, setBusy] = useState(false);

  // No cerramos el panel en cada acción — el usuario quiere poder
  // hacer múltiples clicks consecutivos (e.g., +30m tres veces) sin
  // que se le cierre todo. onDone queda para cuando el caller lo
  // quiera invocar manualmente desde fuera, no aquí.
  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/hops/${hop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error");
      toast.success("Actualizado");
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function del() {
    if (!confirm("¿Borrar este hop?")) return;
    const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/hops/${hop.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Borrado");
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
    } else toast.error("Error");
  }

  function extend(minutes: number) {
    const newExpire = new Date(new Date(hop.expiresAt).getTime() + minutes * 60_000).toISOString();
    patch({ expiresAt: newExpire });
  }

  if (!canCreate(myRole)) return null;

  return (
    <div className="flex gap-1 rounded border border-slate-700 bg-slate-900 p-1 shadow-xl">
      <button disabled={busy} onClick={() => extend(30)} className="rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">+30m</button>
      <button disabled={busy} onClick={() => extend(60)} className="rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">+1h</button>
      <button disabled={busy} onClick={() => patch({ status: "WATCHED" })} className="rounded px-2 py-1 text-xs text-yellow-300 hover:bg-slate-800">👁 Watch</button>
      <button disabled={busy} onClick={() => patch({ status: "COLLAPSED" })} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">✕ Collapsed</button>
      <button disabled={busy} onClick={() => patch({ status: "ACTIVE", statusNote: null })} className="rounded px-2 py-1 text-xs text-green-300 hover:bg-slate-800">✓ Active</button>
      {canDelete(myRole) && (
        <button disabled={busy} onClick={del} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-slate-800">🗑</button>
      )}
    </div>
  );
}
