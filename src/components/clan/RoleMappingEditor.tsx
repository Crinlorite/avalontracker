"use client";
import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import toast from "react-hot-toast";
import type { AppRole } from "@/generated/prisma/client";

type DiscordRole = { id: string; name: string; color: number; position: number };
type Mapping = { id: number; clanId: string; discordRoleId: string; discordRoleName: string; appRole: AppRole };

const ROLES: AppRole[] = ["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"];

export function RoleMappingEditor({ clanId }: { clanId: string }) {
  const { data: discordRoles = [], error: drErr, isLoading: drLoading } = useSWR<DiscordRole[]>(`/api/clans/${clanId}/discord-roles`);
  const { data: mappings = [], mutate } = useSWR<Mapping[]>(`/api/clans/${clanId}/role-mappings`);

  const [newRoleId, setNewRoleId] = useState<string>("");
  const [newAppRole, setNewAppRole] = useState<AppRole>("VIEWER");

  async function addMapping() {
    const role = discordRoles.find((r) => r.id === newRoleId);
    if (!role) return toast.error("Rol inválido");
    const res = await fetch(`/api/clans/${clanId}/role-mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordRoleId: role.id, discordRoleName: role.name, appRole: newAppRole }),
    });
    if (!res.ok) return toast.error("Error al guardar mapping");
    toast.success("Mapping guardado");
    setNewRoleId("");
    mutate();
  }

  async function removeMapping(id: number) {
    if (!confirm("¿Eliminar mapping?")) return;
    const res = await fetch(`/api/clans/${clanId}/role-mappings/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Error al eliminar");
    toast.success("Eliminado");
    mutate();
  }

  if (drErr) {
    return (
      <div className="rounded border border-red-700 bg-red-900/30 p-4 text-sm text-red-200">
        Vigil Bot no responde — no se pueden listar los roles del servidor Discord.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 font-semibold text-white">Mapeos actuales</h3>
        {mappings.length === 0 ? (
          <div className="text-sm text-slate-400">Sin mapeos. Añade al menos uno debajo para que los miembros tengan acceso.</div>
        ) : (
          <ul className="space-y-2">
            {mappings.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
                <div>
                  <span className="font-medium text-white">{m.discordRoleName}</span>
                  <span className="mx-2 text-slate-500">→</span>
                  <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white">{m.appRole}</span>
                </div>
                <button onClick={() => removeMapping(m.id)} className="text-sm text-red-400 hover:text-red-300">Eliminar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 font-semibold text-white">Añadir mapping</h3>
        {drLoading ? (
          <div className="text-sm text-slate-400">Cargando roles Discord…</div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[180px]">
              <span className="text-xs uppercase text-slate-400">Rol Discord</span>
              <select value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                <option value="">— elegir —</option>
                {discordRoles
                  .filter((r) => !mappings.some((m) => m.discordRoleId === r.id))
                  .sort((a, b) => b.position - a.position)
                  .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="flex-1 min-w-[140px]">
              <span className="text-xs uppercase text-slate-400">Rol app</span>
              <select value={newAppRole} onChange={(e) => setNewAppRole(e.target.value as AppRole)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <button onClick={addMapping} disabled={!newRoleId}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              Añadir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
