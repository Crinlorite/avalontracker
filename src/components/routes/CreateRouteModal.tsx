"use client";

import { useState } from "react";
import ZoneAutocomplete from "./ZoneAutocomplete";

interface CreateRouteModalProps {
  clanId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateRouteModal({
  clanId,
  onClose,
  onCreated,
}: CreateRouteModalProps) {
  const [entryZone, setEntryZone] = useState("");
  const [exitZone, setExitZone] = useState("");
  const [portalSize, setPortalSize] = useState<number>(7);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!entryZone.trim() || !exitZone.trim()) {
      setError("Debes seleccionar zona de entrada y salida");
      return;
    }

    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes <= 0) {
      setError("La duración debe ser mayor a 0");
      return;
    }

    const expiresAt = new Date(
      Date.now() + totalMinutes * 60 * 1000
    ).toISOString();

    setSubmitting(true);

    try {
      const res = await fetch(`/api/clans/${clanId}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryZone: entryZone.trim(),
          exitZone: exitZone.trim(),
          portalSize,
          expiresAt,
        }),
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
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
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

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {error && (
            <div className="rounded-lg border border-red-600/30 bg-red-900/20 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Zona de entrada
            </label>
            <ZoneAutocomplete
              value={entryZone}
              onChange={setEntryZone}
              placeholder="Buscar zona de entrada..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Zona de salida
            </label>
            <ZoneAutocomplete
              value={exitZone}
              onChange={setExitZone}
              placeholder="Buscar zona de salida..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Tamaño del portal
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPortalSize(7)}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-center font-semibold transition-all ${
                  portalSize === 7
                    ? "border-blue-500 bg-blue-900/30 text-blue-300"
                    : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                }`}
              >
                7 jugadores
              </button>
              <button
                type="button"
                onClick={() => setPortalSize(20)}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-center font-semibold transition-all ${
                  portalSize === 20
                    ? "border-violet-500 bg-violet-900/30 text-violet-300"
                    : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                }`}
              >
                20 jugadores
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-300">
              Duración
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value) || 0)}
                className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-center text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-gray-400">h</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
                className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-center text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-gray-400">min</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
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
              {submitting ? "Creando..." : "Crear Ruta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
