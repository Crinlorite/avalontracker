"use client";
import { useState, useMemo, useEffect } from "react";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import type { HopView } from "@/hooks/useClanRoutes";
import { secondsLeft, formatCountdown } from "@/lib/time";

// Modal para editar a mano el tiempo de un hop. Se abre desde el grafo
// al clicar el timer del edge: el usuario decide la nueva duración
// (horas + minutos desde AHORA) o usa los botones rápidos para sumar
// al tiempo actual.
//
// UX: NO se cierra al click fuera (perderías el form si te despistas).
// Se cierra con Cancel, X, o ESC.

export function EditHopTimeModal({
  clanId, routeId, hop, onClose,
}: {
  clanId: string;
  routeId: string;
  hop: HopView;
  onClose: () => void;
}) {
  // currentRemainingMin: tiempo restante actual en minutos (usado como
  // valor inicial del input, así el usuario edita desde "lo que queda
  // ahora" como base).
  const initialRemainingMin = useMemo(() => {
    const ms = new Date(hop.expiresAt).getTime() - Date.now();
    return Math.max(0, Math.round(ms / 60_000));
  }, [hop.expiresAt]);

  const [hours, setHours] = useState(Math.floor(initialRemainingMin / 60));
  const [minutes, setMinutes] = useState(initialRemainingMin % 60);
  const [saving, setSaving] = useState(false);

  // ESC cierra el modal (UX baseline tras quitar el cierre por click-fuera).
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  function bump(extraMinutes: number) {
    const total = hours * 60 + minutes + extraMinutes;
    setHours(Math.max(0, Math.floor(total / 60)));
    setMinutes(Math.max(0, total % 60));
  }

  async function save() {
    if (hours === 0 && minutes === 0) {
      toast.error("Pon una duración mayor que 0");
      return;
    }
    setSaving(true);
    try {
      const newExpiresAt = new Date(Date.now() + (hours * 60 + minutes) * 60_000).toISOString();
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/hops/${hop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: newExpiresAt }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Error");
      }
      toast.success("Tiempo actualizado");
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); save(); }}
        className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
      >
        <div>
          <h2 className="text-lg font-bold text-white">Editar tiempo del portal</h2>
          <p className="mt-1 text-sm text-slate-400">
            <span className="text-white">{hop.fromZone.name}</span>
            <span className="mx-1 text-slate-500">→</span>
            <span className="text-white">{hop.toZone.name}</span>
            <span className="ml-2 rounded bg-slate-800 px-1 text-[10px]">{hop.portalSize}p</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Restante actual:{" "}
            <span className="font-mono text-slate-300">
              {formatCountdown(secondsLeft(hop.expiresAt))}
            </span>
          </p>
        </div>

        <div>
          <span className="text-sm text-slate-300">Nueva duración (desde ahora)</span>
          <div className="mt-1 flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={hours}
              onChange={(e) => setHours(Math.max(0, Math.min(48, Number(e.target.value.replace(/\D/g, "")) || 0)))}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-center text-white"
            />
            <span className="text-slate-400">h</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value.replace(/\D/g, "")) || 0)))}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-center text-white"
            />
            <span className="text-slate-400">m</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-400">Sumar al valor actual</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {[15, 30, 45, 60, 120, 240, 480].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => bump(m)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                +{m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setHours(0); setMinutes(0); }}
              className="ml-auto rounded border border-slate-700 px-2 py-1 text-xs text-red-300 hover:bg-slate-800"
            >
              0
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
