"use client";

import { useState } from "react";
import ZoneAutocomplete from "./ZoneAutocomplete";

interface CreateRouteModalProps {
  clanId: string;
  onClose: () => void;
  onCreated: () => void;
}

interface HopForm {
  fromZone: string;
  toZone: string;
  portalSize: number;
  hours: number;
  minutes: number;
}

function emptyHop(fromZone = ""): HopForm {
  return { fromZone, toZone: "", portalSize: 7, hours: 0, minutes: 30 };
}

export default function CreateRouteModal({
  clanId,
  onClose,
  onCreated,
}: CreateRouteModalProps) {
  const [hops, setHops] = useState<HopForm[]>([emptyHop()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updateHop(index: number, field: keyof HopForm, value: string | number) {
    setHops((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // If toZone changes and there's a next hop, update its fromZone
      if (field === "toZone" && index < updated.length - 1) {
        updated[index + 1] = { ...updated[index + 1], fromZone: value as string };
      }
      return updated;
    });
  }

  function addHop() {
    if (hops.length >= 12) return;
    const lastToZone = hops[hops.length - 1].toZone;
    setHops((prev) => [...prev, emptyHop(lastToZone)]);
  }

  function removeHop(index: number) {
    if (hops.length <= 1) return;
    setHops((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // Fix chain continuity
      for (let i = 1; i < updated.length; i++) {
        updated[i] = { ...updated[i], fromZone: updated[i - 1].toZone };
      }
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i];
      if (!hop.fromZone.trim() || !hop.toZone.trim()) {
        setError(`Puerta ${i + 1}: debes indicar zona de entrada y salida`);
        return;
      }
      const totalMinutes = hop.hours * 60 + hop.minutes;
      if (totalMinutes <= 0) {
        setError(`Puerta ${i + 1}: la duración debe ser mayor a 0`);
        return;
      }
    }

    const hopData = hops.map((hop) => ({
      fromZone: hop.fromZone.trim(),
      toZone: hop.toZone.trim(),
      portalSize: hop.portalSize,
      expiresAt: new Date(
        Date.now() + (hop.hours * 60 + hop.minutes) * 60 * 1000
      ).toISOString(),
    }));

    setSubmitting(true);
    try {
      const res = await fetch(`/api/clans/${clanId}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hops: hopData }),
      });

      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear la ruta");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-white">Nueva Ruta</h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
          <div className="space-y-4 p-6 overflow-y-auto">
            {error && (
              <div className="rounded-lg border border-red-600/30 bg-red-900/20 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {hops.map((hop, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-indigo-400">
                    Puerta {index + 1}
                  </span>
                  {hops.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeHop(index)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Eliminar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Entrada</label>
                    {index > 0 ? (
                      <div className="rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-sm text-gray-300">
                        {hop.fromZone || "..."}
                      </div>
                    ) : (
                      <ZoneAutocomplete
                        value={hop.fromZone}
                        onChange={(v) => updateHop(index, "fromZone", v)}
                        placeholder="Zona entrada..."
                      />
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Salida</label>
                    <ZoneAutocomplete
                      value={hop.toZone}
                      onChange={(v) => updateHop(index, "toZone", v)}
                      placeholder="Zona salida..."
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateHop(index, "portalSize", 7)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        hop.portalSize === 7
                          ? "border border-blue-500 bg-blue-900/30 text-blue-300"
                          : "border border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      7p
                    </button>
                    <button
                      type="button"
                      onClick={() => updateHop(index, "portalSize", 20)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        hop.portalSize === 20
                          ? "border border-violet-500 bg-violet-900/30 text-violet-300"
                          : "border border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500"
                      }`}
                    >
                      20p
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={hop.hours}
                      onChange={(e) => updateHop(index, "hours", parseInt(e.target.value) || 0)}
                      className="w-14 rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-center text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={hop.minutes}
                      onChange={(e) => updateHop(index, "minutes", parseInt(e.target.value) || 0)}
                      className="w-14 rounded-md border border-gray-600 bg-gray-700 px-2 py-1.5 text-center text-sm text-white focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">min</span>
                  </div>
                </div>
              </div>
            ))}

            {hops.length < 12 && (
              <button
                type="button"
                onClick={addHop}
                className="w-full rounded-lg border border-dashed border-gray-600 py-2.5 text-sm text-gray-400 transition-colors hover:border-indigo-500 hover:text-indigo-400"
              >
                + Añadir puerta
              </button>
            )}
          </div>

          <div className="flex gap-3 border-t border-gray-800 px-6 py-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting ? "Creando..." : `Crear Ruta (${hops.length} ${hops.length === 1 ? "puerta" : "puertas"})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
