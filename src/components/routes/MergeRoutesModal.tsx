"use client";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import type { RouteView } from "@/hooks/useClanRoutes";

type Position = "append" | "prepend";

export function MergeRoutesModal({
  clanId,
  targetRoute,
  candidateRoutes,
  onClose,
  onMerged,
}: {
  clanId: string;
  targetRoute: RouteView;
  candidateRoutes: RouteView[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [sourceId, setSourceId] = useState<string>("");
  const [position, setPosition] = useState<Position>("append");
  const [allowBrokenChain, setAllowBrokenChain] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const targetSortedHops = useMemo(
    () => [...targetRoute.hops].sort((a, b) => a.order - b.order),
    [targetRoute.hops]
  );
  const lastTarget = targetSortedHops[targetSortedHops.length - 1];
  const firstTarget = targetSortedHops[0];

  const selectedSource = candidateRoutes.find((r) => r.id === sourceId);
  const selectedSortedHops = useMemo(
    () => (selectedSource ? [...selectedSource.hops].sort((a, b) => a.order - b.order) : []),
    [selectedSource]
  );
  const firstSource = selectedSortedHops[0];
  const lastSource = selectedSortedHops[selectedSortedHops.length - 1];

  const resultingHopCount = targetSortedHops.length + selectedSortedHops.length;
  const wouldExceedMax = resultingHopCount > 12;

  const chainIntact =
    !selectedSource ? true
    : position === "append"
      ? !lastTarget || !firstSource || lastTarget.toZone.name === firstSource.fromZone.name
      : !lastSource || !firstTarget || lastSource.toZone.name === firstTarget.fromZone.name;

  async function submit() {
    if (!sourceId) return toast.error("Elige una ruta para fusionar");
    if (wouldExceedMax) return toast.error(`La fusión tendría ${resultingHopCount} hops, máximo 12`);
    if (!chainIntact && !allowBrokenChain) return toast.error("Cadena rota. Marca la casilla si quieres forzar.");

    setSubmitting(true);
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${targetRoute.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceRouteId: sourceId, position, allowBrokenChain: !chainIntact }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Error al fusionar");
      toast.success("Rutas fusionadas");
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
      onMerged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  function chainLabel(r: RouteView): string {
    const hops = [...r.hops].sort((a, b) => a.order - b.order);
    if (hops.length === 0) return "(vacía)";
    return [hops[0].fromZone.name, ...hops.map((h) => h.toZone.name)].join(" → ");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl my-8 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        <div>
          <h2 className="text-xl font-bold text-white">Fusionar rutas</h2>
          <p className="mt-1 text-xs text-slate-400">
            Fusiona otra ruta dentro de esta. Los hops de la origen se mueven aquí y la origen se elimina.
          </p>
        </div>

        <div className="rounded border border-slate-800 bg-slate-950 p-3 text-sm">
          <div className="mb-1 text-xs uppercase text-slate-500">Ruta destino (esta)</div>
          <div className="font-mono text-white">{chainLabel(targetRoute)}</div>
        </div>

        <div>
          <label className="block">
            <span className="text-xs uppercase text-slate-400">Ruta a fusionar</span>
            <select
              value={sourceId}
              onChange={(e) => { setSourceId(e.target.value); setAllowBrokenChain(false); }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              <option value="">— elegir ruta origen —</option>
              {candidateRoutes.map((r) => (
                <option key={r.id} value={r.id}>
                  {chainLabel(r)} ({r.hops.length} hop{r.hops.length === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
          {candidateRoutes.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">No hay otras rutas activas en este clan para fusionar.</p>
          )}
        </div>

        <fieldset className="rounded border border-slate-800 bg-slate-950 p-3">
          <legend className="px-2 text-xs uppercase text-slate-400">Posición</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="radio" checked={position === "append"} onChange={() => setPosition("append")} />
              <span>Añadir al final (origen va DESPUÉS de destino)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input type="radio" checked={position === "prepend"} onChange={() => setPosition("prepend")} />
              <span>Insertar al principio (origen va ANTES de destino)</span>
            </label>
          </div>
        </fieldset>

        {selectedSource && (
          <div className="rounded border border-slate-800 bg-slate-950 p-3 text-sm">
            <div className="mb-2 text-xs uppercase text-slate-500">Resultado ({resultingHopCount} hops)</div>
            <div className="font-mono text-white">
              {position === "append"
                ? `${chainLabel(targetRoute)} · ${chainLabel(selectedSource)}`
                : `${chainLabel(selectedSource)} · ${chainLabel(targetRoute)}`}
            </div>
            {wouldExceedMax && (
              <div className="mt-2 rounded bg-red-900/40 px-2 py-1 text-xs text-red-200">
                ⚠️ Excede el máximo de 12 hops. No se permite.
              </div>
            )}
            {!wouldExceedMax && !chainIntact && (
              <label className="mt-2 flex items-start gap-2 rounded bg-yellow-900/20 px-2 py-2 text-xs text-yellow-200">
                <input
                  type="checkbox"
                  checked={allowBrokenChain}
                  onChange={(e) => setAllowBrokenChain(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <strong>Cadena rota:</strong> las zonas en el punto de unión no coinciden.
                  Marca esta casilla para fusionarlas de todas formas (útil para agrupar portales no contiguos).
                </span>
              </label>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >Cancelar</button>
          <button
            type="submit"
            disabled={submitting || !sourceId || wouldExceedMax}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Fusionando…" : "Fusionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
