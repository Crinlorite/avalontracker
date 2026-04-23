"use client";
import useSWR from "swr";
import { ClanGraph } from "@/components/graph/ClanGraph";
import type { RouteView } from "@/hooks/useClanRoutes";

export default function AdminMapPage() {
  const { data: routes = [], isLoading } = useSWR<RouteView[]>("/api/admin/map");

  if (isLoading) return <div className="text-slate-400">Cargando grafo global…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Grafo global (todas las rutas activas)</h1>
      <p className="text-xs text-slate-500">{routes.length} rutas.</p>
      <ClanGraph routes={routes} anchorZoneName={null} onNodeClick={() => {}} />
    </div>
  );
}
