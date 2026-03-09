"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import RouteTimer from "@/components/routes/RouteTimer";
import CreateRouteModal from "@/components/routes/CreateRouteModal";
import DiscordPushButton from "@/components/routes/DiscordPushButton";

interface Route {
  id: string;
  entryZone: string;
  exitZone: string;
  portalSize: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  creator?: { id: string; displayName?: string | null };
}

type FilterTab = "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL";

const filterLabels: Record<FilterTab, string> = {
  ACTIVE: "Activas",
  EXPIRED: "Expiradas",
  DISABLED: "Deshabilitadas",
  ALL: "Todas",
};

export default function ClanRoutesPage() {
  const params = useParams();
  const clanId = params.clanId as string;
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("ACTIVE");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clanName, setClanName] = useState("");

  const fetchRoutes = useCallback(async () => {
    try {
      const statusParam = filter !== "ALL" ? `?status=${filter}` : "";
      const res = await fetch(`/api/clans/${clanId}/routes${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
      }
    } catch {
      console.error("Error al cargar rutas");
    } finally {
      setLoading(false);
    }
  }, [clanId, filter]);

  useEffect(() => {
    async function fetchClan() {
      try {
        const res = await fetch(`/api/clans/${clanId}`);
        if (res.ok) {
          const data = await res.json();
          setClanName(data.name);
        }
      } catch {
        /* empty */
      }
    }
    fetchClan();
  }, [clanId]);

  useEffect(() => {
    setLoading(true);
    fetchRoutes();
  }, [fetchRoutes]);

  async function handleDisable(routeId: string) {
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISABLED" }),
      });
      if (res.ok) {
        fetchRoutes();
      }
    } catch {
      console.error("Error al deshabilitar ruta");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{clanName || "Clan"}</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          + Nueva Ruta
        </button>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900/50 p-1">
        {(Object.keys(filterLabels) as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === tab
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {filterLabels[tab]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : routes.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No hay rutas para mostrar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-800 md:block">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Ruta
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Portal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Tiempo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                    Creador
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {routes.map((route) => (
                  <tr key={route.id} className="bg-gray-950 hover:bg-gray-900/50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">
                        {route.entryZone}
                      </span>
                      <span className="mx-2 text-gray-500">&rarr;</span>
                      <span className="font-medium text-white">
                        {route.exitZone}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          route.portalSize === 20
                            ? "bg-violet-900/50 text-violet-300"
                            : "bg-blue-900/50 text-blue-300"
                        }`}
                      >
                        {route.portalSize}p
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RouteTimer expiresAt={route.expiresAt} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={route.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {route.creator?.displayName || "Desconocido"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DiscordPushButton
                          clanId={clanId}
                          routeId={route.id}
                        />
                        {route.status === "ACTIVE" && (
                          <button
                            onClick={() => handleDisable(route.id)}
                            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-red-900/50 hover:text-red-300"
                          >
                            Deshabilitar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {routes.map((route) => (
              <div
                key={route.id}
                className="rounded-lg border border-gray-800 bg-gray-900 p-4 shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-white">
                      {route.entryZone}
                    </span>
                    <span className="mx-2 text-gray-500">&rarr;</span>
                    <span className="font-medium text-white">
                      {route.exitZone}
                    </span>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      route.portalSize === 20
                        ? "bg-violet-900/50 text-violet-300"
                        : "bg-blue-900/50 text-blue-300"
                    }`}
                  >
                    {route.portalSize}p
                  </span>
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <RouteTimer expiresAt={route.expiresAt} />
                  <StatusBadge status={route.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {route.creator?.displayName || "Desconocido"}
                  </span>
                  <div className="flex gap-2">
                    <DiscordPushButton clanId={clanId} routeId={route.id} />
                    {route.status === "ACTIVE" && (
                      <button
                        onClick={() => handleDisable(route.id)}
                        className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-red-900/50 hover:text-red-300"
                      >
                        Deshabilitar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateRouteModal
          clanId={clanId}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchRoutes();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-green-900/50 text-green-300",
    EXPIRED: "bg-gray-700/50 text-gray-400",
    DISABLED: "bg-red-900/50 text-red-300",
  };

  const labels: Record<string, string> = {
    ACTIVE: "Activa",
    EXPIRED: "Expirada",
    DISABLED: "Deshabilitada",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "bg-gray-700 text-gray-300"
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
