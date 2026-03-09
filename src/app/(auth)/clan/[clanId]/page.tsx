"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import RouteTimer from "@/components/routes/RouteTimer";
import CreateRouteModal from "@/components/routes/CreateRouteModal";
import DiscordPushButton from "@/components/routes/DiscordPushButton";

interface Hop {
  id: number;
  order: number;
  fromZone: string;
  toZone: string;
  portalSize: number;
  expiresAt: string;
  status: string;
}

interface Route {
  id: string;
  status: string;
  createdAt: string;
  hops: Hop[];
  createdBy?: { id: string; displayName?: string | null };
}

type FilterTab = "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL";

const filterLabels: Record<FilterTab, string> = {
  ACTIVE: "Activas",
  EXPIRED: "Expiradas",
  DISABLED: "Deshabilitadas",
  ALL: "Todas",
};

function getChainLabel(hops: Hop[]): string {
  if (hops.length === 0) return "Sin puertas";
  const zones = [hops[0].fromZone, ...hops.map((h) => h.toZone)];
  return zones.join(" → ");
}

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
          {routes.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              clanId={clanId}
              onDisable={handleDisable}
            />
          ))}
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

function RouteCard({
  route,
  clanId,
  onDisable,
}: {
  route: Route;
  clanId: string;
  onDisable: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">
            {getChainLabel(route.hops)}
          </span>
          <StatusBadge status={route.status} />
          <span className="text-xs text-gray-500">
            {route.hops.length} {route.hops.length === 1 ? "puerta" : "puertas"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {route.createdBy?.displayName || "Desconocido"}
          </span>
          <DiscordPushButton clanId={clanId} routeId={route.id} />
          {route.status === "ACTIVE" && (
            <button
              onClick={() => onDisable(route.id)}
              className="rounded-md bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-red-900/50 hover:text-red-300"
            >
              Deshabilitar
            </button>
          )}
        </div>
      </div>

      {/* Hops */}
      <div className="divide-y divide-gray-800/50">
        {route.hops.map((hop) => (
          <div key={hop.id} className="flex items-center gap-4 px-4 py-2.5">
            <span className="w-5 text-center text-xs font-medium text-gray-500">
              {hop.order + 1}
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm text-white truncate">{hop.fromZone}</span>
              <span className="text-gray-500 shrink-0">&rarr;</span>
              <span className="text-sm text-white truncate">{hop.toZone}</span>
            </div>
            <span
              className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                hop.portalSize === 20
                  ? "bg-violet-900/50 text-violet-300"
                  : "bg-blue-900/50 text-blue-300"
              }`}
            >
              {hop.portalSize}p
            </span>
            <div className="shrink-0">
              <RouteTimer expiresAt={hop.expiresAt} />
            </div>
          </div>
        ))}
      </div>
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
