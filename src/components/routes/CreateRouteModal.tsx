"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { mutate } from "swr";
import { ZoneAutocomplete } from "@/components/zones/ZoneAutocomplete";

type HopInput = { fromZone: string; toZone: string; portalSize: 7 | 20 | 40; hours: number; minutes: number };

const newHop = (from = ""): HopInput => ({ fromZone: from, toZone: "", portalSize: 7, hours: 2, minutes: 0 });

export function CreateRouteModal({
  clanId, onClose, onCreated, defaultFromZone,
}: {
  clanId: string; onClose: () => void; onCreated: () => void;
  defaultFromZone?: string;
}) {
  const [hops, setHops] = useState<HopInput[]>([newHop(defaultFromZone ?? "")]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setHop(i: number, patch: Partial<HopInput>) {
    setHops((prev) => {
      const next = prev.map((h, idx) => idx === i ? { ...h, ...patch } : h);
      if (patch.toZone != null && next[i + 1]) next[i + 1] = { ...next[i + 1], fromZone: patch.toZone };
      return next;
    });
  }

  function addHop() { setHops((p) => [...p, newHop(p[p.length - 1].toZone)]); }
  function removeHop(i: number) { setHops((p) => p.filter((_, idx) => idx !== i)); }
  function bumpTime(i: number, minutes: number) {
    setHops((p) => p.map((h, idx) => {
      if (idx !== i) return h;
      const total = h.hours * 60 + h.minutes + minutes;
      return { ...h, hours: Math.max(0, Math.floor(total / 60)), minutes: Math.max(0, total % 60) };
    }));
  }

  function validate(): string | null {
    for (let i = 0; i < hops.length; i++) {
      const h = hops[i];
      if (!h.fromZone.trim() || !h.toZone.trim()) return `Hop ${i + 1}: zonas obligatorias`;
      if (h.hours === 0 && h.minutes === 0) return `Hop ${i + 1}: duración > 0`;
      if (i > 0 && h.fromZone !== hops[i - 1].toZone) return `Hop ${i + 1}: cadena rota (${hops[i - 1].toZone} → ${h.fromZone})`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);
    setSubmitting(true);
    const now = Date.now();
    const body = {
      hops: hops.map((h) => ({
        fromZone: h.fromZone.trim(),
        toZone: h.toZone.trim(),
        portalSize: h.portalSize,
        expiresAt: new Date(now + (h.hours * 60 + h.minutes) * 60_000).toISOString(),
      })),
      notes: notes.trim() || undefined,
    };
    try {
      const res = await fetch(`/api/clans/${clanId}/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error?.message ?? "Error al crear ruta"); }
      toast.success("Ruta creada");
      mutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl my-8 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">Nueva ruta</h2>

        <div className="space-y-3">
          {hops.map((h, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded border border-slate-800 bg-slate-950 p-3">
              <div className="col-span-5">
                <div className="text-xs text-slate-400">Desde</div>
                <ZoneAutocomplete value={h.fromZone} onChange={(v) => setHop(i, { fromZone: v })} disabled={i > 0} />
              </div>
              <div className="col-span-5">
                <div className="text-xs text-slate-400">Hasta</div>
                <ZoneAutocomplete value={h.toZone} onChange={(v) => setHop(i, { toZone: v })} />
              </div>
              <div className="col-span-2 flex flex-col">
                <div className="text-xs text-slate-400">Tamaño</div>
                <select value={h.portalSize} onChange={(e) => setHop(i, { portalSize: Number(e.target.value) as 7 | 20 | 40 })}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white">
                  <option value={7}>7p</option>
                  <option value={20}>20p</option>
                  <option value={40}>Tentáculo</option>
                </select>
              </div>
              <div className="col-span-12 flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-400">Duración
                  <div className="mt-1 flex gap-1">
                    {/* type=text + inputMode=numeric: sin spinners up/down,
                        teclado numérico en móvil, y el usuario puede borrar
                        y reescribir el número crudo sin que se "atore" en
                        ediciones intermedias. Saneamos el valor a entero
                        positivo en el handler. */}
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={h.hours}
                      onChange={(e) => setHop(i, { hours: Math.max(0, Math.min(24, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                      className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                    /> h
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={h.minutes}
                      onChange={(e) => setHop(i, { minutes: Math.max(0, Math.min(59, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                      className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                    /> m
                  </div>
                </label>
                {[30, 60, 120, 240, 360].map((m) => (
                  <button key={m} type="button" onClick={() => bumpTime(i, m)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
                    +{m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
                {hops.length > 1 && <button type="button" onClick={() => removeHop(i)} className="ml-auto rounded bg-red-700/50 px-2 py-1 text-xs text-red-200">Quitar</button>}
              </div>
            </div>
          ))}
        </div>

        {hops.length < 12 && (
          <button type="button" onClick={addHop} className="w-full rounded border border-dashed border-slate-700 py-2 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-400">
            + Añadir hop
          </button>
        )}

        <label className="block">
          <span className="text-sm text-slate-300">Nota (opcional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button>
          <button type="submit" disabled={submitting} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Creando…" : "Crear ruta"}
          </button>
        </div>
      </form>
    </div>
  );
}
