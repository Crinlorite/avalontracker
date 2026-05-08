"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { PageHeader } from "@/components/layout/PageHeader";

type AuditEntry = {
  id: number; action: string; details: Record<string, unknown> | null; createdAt: string;
  user: { id: string; discordUsername: string; globalNickname: string | null; displayName: string | null };
};
type AuditResponse = { data: AuditEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const ACTION_LABELS: Record<string, string> = {
  CLAN_CREATE: "Clan creado", CLAN_UPDATE: "Clan actualizado", CLAN_DELETE: "Clan eliminado",
  MEMBER_ROLE_SYNCED: "Rol sincronizado", MEMBER_LEFT: "Miembro dejó clan",
  ROUTE_CREATE: "Ruta creada", ROUTE_UPDATE: "Ruta actualizada", ROUTE_DISABLE: "Ruta deshabilitada", ROUTE_DELETE: "Ruta eliminada",
  HOP_STATUS_CHANGED: "Estado de hop", HOP_EXTENDED: "Hop extendido", HOP_DELETE: "Hop eliminado",
  SETTINGS_CHANGE: "Config cambiada", ROLE_MAPPING_CHANGE: "Mapeo de rol", WEBHOOK_UPDATE: "Webhook actualizado",
  DISCORD_LOGIN_FIRST: "Primer login Discord",
};

export default function AuditPage() {
  const { clanId } = useParams() as { clanId: string };
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR<AuditResponse>(`/api/clans/${clanId}/audit?page=${page}&limit=20`);

  // El endpoint GET de audit ya gatea a ADMIN; si llegamos aquí somos ADMIN
  // del clan y podemos borrar entradas. Sin figura super admin global — el
  // RBAC es puro: ADMIN del clan actúa sobre su propio audit log.

  async function removeEntry(id: number) {
    if (!confirm("¿Borrar esta entrada de auditoría? (irreversible)")) return;
    const res = await fetch(`/api/clans/${clanId}/audit?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Entrada borrada"); mutate(); }
    else toast.error("Error al borrar");
  }

  if (error?.status === 403) {
    return <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Solo los Admin del clan pueden ver auditoría.</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader>
        <h1 className="text-2xl font-bold text-white">Auditoría</h1>
      </PageHeader>

      {isLoading && <div className="text-slate-400">Cargando…</div>}

      {!isLoading && (data?.data.length ?? 0) === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Sin eventos registrados.</div>
      )}

      {(data?.data.length ?? 0) > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Fecha</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Usuario</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Acción</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Detalles</th>
                  <th className="px-3 py-2 text-right text-xs uppercase text-slate-400">•</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data!.data.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{new Date(e.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-2 text-white">{e.user.displayName ?? e.user.globalNickname ?? e.user.discordUsername}</td>
                    <td className="px-3 py-2 text-slate-300">{ACTION_LABELS[e.action] ?? e.action}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.details ? JSON.stringify(e.details) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeEntry(e.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                        title="Borrar esta entrada"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 disabled:opacity-50">Anterior</button>
            <span className="text-sm text-slate-500">Página {data!.pagination.page} de {data!.pagination.totalPages} · {data!.pagination.total} eventos</span>
            <button disabled={page >= data!.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 disabled:opacity-50">Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}
