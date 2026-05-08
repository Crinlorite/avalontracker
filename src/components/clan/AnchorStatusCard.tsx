"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import type { ClanDetail, SecurityLevel } from "@/hooks/useClan";
import { canCreate } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

// Umbral de "info rancia": pasadas 3h sin actualizar el parte de
// seguridad la UI lo marca como sospechoso. Al fin y al cabo en Avalon
// las cosas cambian rápido — un parte de hace 4h ya no informa.
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

const LEVEL_META: Record<SecurityLevel, { color: string; label: string; bg: string }> = {
  SAFE: { color: "#22c55e", label: "Seguro", bg: "rgba(34, 197, 94, 0.12)" },
  CAUTION: { color: "#eab308", label: "Precaución", bg: "rgba(234, 179, 8, 0.12)" },
  DANGER: { color: "#ef4444", label: "Peligro", bg: "rgba(239, 68, 68, 0.12)" },
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h ${min % 60}m`;
  const days = Math.floor(h / 24);
  return `hace ${days}d`;
}

export function AnchorStatusCard({
  clan, myRole,
}: { clan: ClanDetail; myRole: AppRole | null }) {
  const [editing, setEditing] = useState(false);
  const [draftLevel, setDraftLevel] = useState<SecurityLevel | "">(clan.anchorSecurityLevel ?? "");
  const [draftNotes, setDraftNotes] = useState(clan.anchorNotes ?? "");
  const [saving, setSaving] = useState(false);

  const canEdit = canCreate(myRole); // CONTRIBUTOR+

  const level = clan.anchorSecurityLevel;
  const meta = level ? LEVEL_META[level] : null;
  const lastUpdate = clan.anchorNotesAt ? new Date(clan.anchorNotesAt) : null;
  const isStale = lastUpdate ? Date.now() - lastUpdate.getTime() > STALE_AFTER_MS : false;

  function openEditor() {
    setDraftLevel(clan.anchorSecurityLevel ?? "");
    setDraftNotes(clan.anchorNotes ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const body: { level?: SecurityLevel | null; notes?: string | null } = {};
      body.level = draftLevel === "" ? null : draftLevel;
      body.notes = draftNotes.trim() || null;
      const res = await fetch(`/api/clans/${clan.id}/anchor-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Error");
      }
      toast.success("Estado actualizado");
      globalMutate(`/api/clans/${clan.id}`);
      setEditing(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (!clan.anchorZoneId) return null;

  return (
    <>
      <div
        className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3"
        style={meta ? { borderColor: `${meta.color}40` } : undefined}
      >
        {/* Círculo del semáforo */}
        <div
          className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded-full ${level ? "" : "border-2 border-dashed border-slate-600"}`}
          style={{
            background: meta?.color ?? "transparent",
            boxShadow: meta && !isStale ? `0 0 8px ${meta.color}80` : "none",
            opacity: isStale ? 0.5 : 1,
          }}
          title={meta?.label ?? "Sin información"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-white">
              {meta?.label ?? "Sin parte de seguridad"}
            </span>
            {lastUpdate && (
              <span className={`text-xs ${isStale ? "text-amber-400" : "text-slate-500"}`}>
                {formatRelative(lastUpdate.toISOString())}
                {isStale && <span className="ml-1">⚠ rancio</span>}
              </span>
            )}
          </div>
          {clan.anchorNotes ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-300">
              {clan.anchorNotes}
            </p>
          ) : (
            <p className="mt-1 text-xs italic text-slate-500">
              Sin notas. {canEdit && "Click 'Actualizar' para reportar gankers, equipos vistos, actividad."}
            </p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={openEditor}
            className="flex-shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Actualizar
          </button>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditing(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); save(); }}
            className="w-full max-w-lg space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
          >
            <h2 className="text-lg font-bold text-white">Actualizar parte del anchor</h2>
            <p className="text-xs text-slate-400">
              Tu update marca la hora actual como última revisión. Pasadas 3h sin actualizar
              el parte se considera rancio (warning visual).
            </p>

            <div>
              <span className="text-sm text-slate-300">Nivel de seguridad</span>
              <div className="mt-2 flex gap-2">
                {(Object.keys(LEVEL_META) as SecurityLevel[]).map((lv) => {
                  const m = LEVEL_META[lv];
                  const active = draftLevel === lv;
                  return (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setDraftLevel(lv)}
                      className="flex-1 rounded border-2 px-3 py-2 text-sm font-semibold transition-colors"
                      style={{
                        borderColor: active ? m.color : "#334155",
                        background: active ? m.bg : "transparent",
                        color: active ? m.color : "#94a3b8",
                      }}
                    >
                      <span
                        className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                        style={{ background: m.color }}
                      />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {draftLevel !== "" && (
                <button
                  type="button"
                  onClick={() => setDraftLevel("")}
                  className="mt-2 text-xs text-slate-500 underline hover:text-slate-300"
                >
                  Limpiar nivel
                </button>
              )}
            </div>

            <label className="block">
              <span className="text-sm text-slate-300">
                Parte (gankers, equipos, actividad — texto libre)
              </span>
              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                rows={5}
                maxLength={500}
                placeholder="Ej: 2 gankers vistos zona N, equipo de daga + arco T7. Hace 20m volaron hacia Mists Portal."
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <span className="mt-1 block text-right text-[10px] text-slate-500">
                {draftNotes.length}/500
              </span>
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar parte"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
