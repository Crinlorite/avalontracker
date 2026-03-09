"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

interface AuditEntry {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: {
    displayName?: string | null;
    name?: string | null;
  };
}

const ACTION_LABELS: Record<string, string> = {
  CLAN_CREATE: "Clan creado",
  CLAN_CREATED: "Clan creado",
  MEMBER_JOIN: "Miembro unido",
  MEMBER_KICK: "Miembro expulsado",
  MEMBER_LEAVE: "Miembro salió",
  MEMBER_ROLE_CHANGE: "Cambio de rol",
  ROUTE_CREATE: "Ruta creada",
  ROUTE_CREATED: "Ruta creada",
  ROUTE_DISABLE: "Ruta deshabilitada",
  ROUTE_DELETE: "Ruta eliminada",
  CODE_GENERATE: "Código generado",
  CODE_RESOLVE: "Código resuelto",
  WEBHOOK_UPDATE: "Webhook actualizado",
  SETTINGS_CHANGE: "Configuración cambiada",
};

const PAGE_SIZE = 20;

export default function AuditPage() {
  const params = useParams();
  const clanId = params.clanId as string;
  const { data: session } = useSession();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [myRole, setMyRole] = useState<string>("MEMBER");

  useEffect(() => {
    async function fetchRole() {
      try {
        const res = await fetch(`/api/clans/${clanId}/members`);
        if (res.ok) {
          const members = await res.json();
          const me = members.find(
            (m: { userId: string }) => m.userId === session?.user?.id
          );
          if (me) setMyRole(me.role);
        }
      } catch {
        /* empty */
      }
    }
    if (session?.user?.id) fetchRole();
  }, [clanId, session?.user?.id]);

  useEffect(() => {
    fetchAudit();
  }, [clanId, page]);

  async function fetchAudit() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clans/${clanId}/audit?page=${page}&limit=${PAGE_SIZE}`
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || data);
        setHasMore(
          Array.isArray(data.entries)
            ? data.entries.length === PAGE_SIZE
            : data.length === PAGE_SIZE
        );
      }
    } catch {
      console.error("Error al cargar auditoría");
    } finally {
      setLoading(false);
    }
  }

  const isOfficerPlus = myRole === "OWNER" || myRole === "OFFICER";

  if (!isOfficerPlus) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400">
          No tienes permisos para ver el registro de auditoría.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Auditoría</h2>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No hay registros de auditoría.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Acción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Detalles
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="bg-gray-950 hover:bg-gray-900/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {new Date(entry.createdAt).toLocaleString("es-ES", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-white">
                      {entry.user?.displayName || entry.user?.name || "Desconocido"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {entry.details
                        ? JSON.stringify(entry.details)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-500">Página {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
