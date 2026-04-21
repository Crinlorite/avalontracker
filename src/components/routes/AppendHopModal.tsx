"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import { ZoneAutocomplete } from "@/components/zones/ZoneAutocomplete";
import type { RouteView } from "@/hooks/useClanRoutes";

type PortalSize = 7 | 20 | 40;

export function AppendHopModal({
  clanId, route, onClose, onAdded,
}: { clanId: string; route: RouteView; onClose: () => void; onAdded: () => void }) {
  const sortedHops = [...route.hops].sort((a, b) => a.order - b.order);
  const lastHop = sortedHops[sortedHops.length - 1];
  const suggestedFrom = lastHop?.toZone.name ?? "";

  const [fromZone, setFromZone] = useState(suggestedFrom);
  const [toZone, setToZone] = useState("");
  const [portalSize, setPortalSize] = useState<PortalSize>(7);
  const [hours, setHours] = useState(2);
  const [minutes, setMinutes] = useState(0);
  const [allowBrokenChain, setAllowBrokenChain] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function bumpTime(delta: number) {
    const total = Math.max(0, hours * 60 + minutes + delta);
    setHours(Math.floor(total / 60));
    setMinutes(total % 60);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromZone.trim() || !toZone.trim()) return toast.error("Zonas obligatorias");
    if (hours === 0 && minutes === 0) return toast.error("Duración > 0");

    setSubmitting(true);
    const expiresAt = new Date(Date.now() + (hours * 60 + minutes) * 60_000).toISOString();
    const brokenChain = lastHop && fromZone.trim() !== lastHop.toZone.name;

    if (brokenChain && !allowBrokenChain) {
      setSubmitting(false);
      return toast.error(`Cadena no continua. El último hop termina en "${lastHop.toZone.name}". Marca "Permitir cadena rota" para forzar.`);
    }

    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${route.id}/hops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromZone: fromZone.trim(),
          toZone: toZone.trim(),
          portalSize,
          expiresAt,
          allowBrokenChain: brokenChain ? true : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Error al añadir hop");
      }
      toast.success("Hop añadido");
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
      onAdded();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  const brokenChainPreview =
    lastHop && fromZone.trim() && fromZone.trim() !== lastHop.toZone.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg my-8 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        <div>
          <h2 className="text-xl font-bold text-white">Añadir hop</h2>
          <p className="mt-1 text-xs text-slate-400">
            Ruta actual: {sortedHops.map((h, i) => (
              <span key={h.id}>
                {i === 0 && h.fromZone.name}
                <span className="text-slate-500"> → </span>
                <span className="text-white">{h.toZone.name}</span>
              </span>
            ))}
          </p>
          {lastHop && (
            <p className="mt-1 text-xs text-slate-500">
              Último hop termina en <span className="text-slate-300">{lastHop.toZone.name}</span>. El nuevo debería empezar ahí para mantener cadena continua.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Desde</span>
            <ZoneAutocomplete value={fromZone} onChange={setFromZone} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Hasta</span>
            <ZoneAutocomplete value={toZone} onChange={setToZone} />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Tamaño portal</span>
            <select
              value={portalSize}
              onChange={(e) => setPortalSize(Number(e.target.value) as PortalSize)}
              className="mt-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              <option value={7}>7p</option>
              <option value={20}>20p</option>
              <option value={40}>Tentáculo</option>
            </select>
          </label>

          <label className="flex-1 min-w-[160px]">
            <span className="text-xs text-slate-400">Duración</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                type="number" min="0" max="24" value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              /> h
              <input
                type="number" min="0" max="59" value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white"
              /> m
            </div>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {[30, 60, 120, 240, 360].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => bumpTime(m)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              +{m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>

        {brokenChainPreview && (
          <label className="flex items-start gap-2 rounded border border-yellow-700 bg-yellow-900/20 p-3 text-xs text-yellow-200">
            <input
              type="checkbox"
              checked={allowBrokenChain}
              onChange={(e) => setAllowBrokenChain(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Cadena rota:</strong> el nuevo hop empieza en <code className="text-yellow-100">{fromZone}</code> pero el último termina en <code className="text-yellow-100">{lastHop?.toZone.name}</code>. Marca esta casilla para forzar (útil para agrupar portales no contiguos en una misma ruta).
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >Cancelar</button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Añadiendo…" : "Añadir hop"}
          </button>
        </div>
      </form>
    </div>
  );
}
