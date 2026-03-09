"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import RouteTimer from "@/components/routes/RouteTimer";

interface AdminRoute {
  id: string;
  entryZone: string;
  exitZone: string;
  portalSize: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  clan: { id: string; name: string };
  creator?: { displayName?: string | null };
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (session && !session.user.isSuperAdmin) {
      redirect("/dashboard");
    }
  }, [session]);

  useEffect(() => {
    fetchRoutes();
  }, []);

  async function fetchRoutes() {
    try {
      const res = await fetch("/api/admin/routes");
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
      }
    } catch {
      console.error("Error al cargar rutas");
    } finally {
      setLoading(false);
    }
  }

  const filteredRoutes = routes.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.entryZone.toLowerCase().includes(q) ||
      r.exitZone.toLowerCase().includes(q) ||
      r.clan.name.toLowerCase().includes(q) ||
      (r.creator?.displayName || "").toLowerCase().includes(q)
    );
  });

  if (!session?.user?.isSuperAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-3xl font-bold text-white">Panel de Administración</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por zona, clan o creador..."
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-400">
                  Clan
                </th>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredRoutes.map((route) => (
                <tr
                  key={route.id}
                  className="bg-gray-950 hover:bg-gray-900/50"
                >
                  <td className="px-4 py-3 text-sm font-medium text-indigo-400">
                    {route.clan.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-white">{route.entryZone}</span>
                    <span className="mx-2 text-gray-500">&rarr;</span>
                    <span className="text-white">{route.exitZone}</span>
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
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        route.status === "ACTIVE"
                          ? "bg-green-900/50 text-green-300"
                          : route.status === "DISABLED"
                            ? "bg-red-900/50 text-red-300"
                            : "bg-gray-700/50 text-gray-400"
                      }`}
                    >
                      {route.status === "ACTIVE"
                        ? "Activa"
                        : route.status === "DISABLED"
                          ? "Deshabilitada"
                          : "Expirada"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {route.creator?.displayName || "Desconocido"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRoutes.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No se encontraron rutas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
