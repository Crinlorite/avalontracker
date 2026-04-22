"use client";
import { useState } from "react";
import { MergeRoutesModal } from "./MergeRoutesModal";
import type { RouteView } from "@/hooks/useClanRoutes";

// Variante "desde cero" del MergeRoutesModal: elige primero la ruta destino,
// luego el modal normal de merge con candidatos filtrados. Útil en el grafo
// donde no hay una ruta preseleccionada.
export function MergeRoutesPicker({
  clanId,
  routes,
  onClose,
  onMerged,
}: {
  clanId: string;
  routes: RouteView[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const target = routes.find((r) => r.id === targetId) ?? null;

  function chainLabel(r: RouteView): string {
    const hops = [...r.hops].sort((a, b) => a.order - b.order);
    if (hops.length === 0) return "(vacía)";
    return [hops[0].fromZone.name, ...hops.map((h) => h.toZone.name)].join(" → ");
  }

  if (target) {
    return (
      <MergeRoutesModal
        clanId={clanId}
        targetRoute={target}
        candidateRoutes={routes.filter((r) => r.id !== target.id)}
        onClose={onClose}
        onMerged={onMerged}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg my-8 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        <div>
          <h2 className="text-xl font-bold text-white">Fusionar rutas</h2>
          <p className="mt-1 text-xs text-slate-400">
            Primero elige la ruta que <strong>recibe</strong> (los hops de la otra se moverán aquí). En el siguiente paso eliges la ruta a fusionar y la posición.
          </p>
        </div>

        <label className="block">
          <span className="text-xs uppercase text-slate-400">Ruta destino (la que recibe)</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">— elegir ruta destino —</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {chainLabel(r)} ({r.hops.length} hop{r.hops.length === 1 ? "" : "s"})
              </option>
            ))}
          </select>
        </label>

        {routes.length < 2 && (
          <div className="rounded border border-yellow-800 bg-yellow-900/20 p-3 text-xs text-yellow-200">
            Necesitas al menos 2 rutas para poder fusionar.
          </div>
        )}

        <p className="text-xs text-slate-500">
          Al seleccionar una ruta avanzarás al siguiente paso donde eliges la origen y la posición.
        </p>

        <div className="flex justify-end border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
