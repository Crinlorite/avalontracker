"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { useClan } from "@/hooks/useClan";
import { useMe } from "@/hooks/useMe";
import { RouteListTable } from "@/components/routes/RouteListTable";
import { CreateRouteModal } from "@/components/routes/CreateRouteModal";
import { MergeRoutesPicker } from "@/components/routes/MergeRoutesPicker";
import { ViewToggle } from "@/components/clan/ViewToggle";
import { HamburgerButton } from "@/components/layout/SidebarToggleContext";
import { canCreate, canDelete } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function ClanListPage() {
  const { clanId } = useParams() as { clanId: string };
  const { clan } = useClan(clanId);
  const { routes, isLoading } = useClanRoutes(clanId);
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const { me } = useMe();
  const myRole: AppRole | null = members.find((m) => m.userId === me?.id)?.appRole ?? null;

  const [showCreate, setShowCreate] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  if (isLoading) return <div className="text-slate-400">Cargando…</div>;

  const anchorName = clan?.anchorZoneId
    ? routes.flatMap((r) => r.hops).find((h) => h.fromZone.id === clan.anchorZoneId)?.fromZone.name
      ?? routes.flatMap((r) => r.hops).find((h) => h.toZone.id === clan.anchorZoneId)?.toZone.name
      ?? null
    : null;

  const canMerge = canDelete(myRole) && routes.length >= 2;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <div>
            <h1 className="text-2xl font-bold text-white">{clan?.name ?? "…"}</h1>
            <p className="text-xs text-slate-500">{routes.length} rutas activas · anchor: {anchorName ?? "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle clanId={clanId} />
          {canMerge && (
            <button
              onClick={() => setShowMerge(true)}
              className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
              title="Fusionar dos rutas en una sola cadena"
            >
              ⛓ Fusionar rutas
            </button>
          )}
          {canCreate(myRole) && (
            <button
              onClick={() => setShowCreate(true)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              + Nueva ruta
            </button>
          )}
        </div>
      </header>

      <RouteListTable routes={routes} myRole={myRole} />

      {showCreate && <CreateRouteModal clanId={clanId} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
      {showMerge && (
        <MergeRoutesPicker
          clanId={clanId}
          routes={routes}
          onClose={() => setShowMerge(false)}
          onMerged={() => setShowMerge(false)}
        />
      )}
    </div>
  );
}
