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

  const canMerge = canDelete(myRole) && routes.length >= 2;

  return (
    <div className="space-y-3 md:space-y-4">
      {/*
        Mismo header de una fila que el grafo: hamburger + clan name
        + ViewToggle + acciones, todo en línea. Botones icon-only en
        mobile, subtítulo oculto en mobile, mención al anchor quitada
        (no aporta en este header — está en el AnchorStatusCard del
        grafo y en el detalle del clan).
      */}
      <header className="flex items-center gap-2 md:gap-3">
        <HamburgerButton />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-white md:text-2xl">{clan?.name ?? "…"}</h1>
          <p className="hidden text-xs text-slate-500 md:block">{routes.length} rutas activas</p>
        </div>
        <ViewToggle clanId={clanId} />
        {canMerge && (
          <button
            onClick={() => setShowMerge(true)}
            className="shrink-0 rounded bg-slate-700 px-2.5 py-1.5 text-sm text-white hover:bg-slate-600 md:px-3"
            title="Fusionar dos rutas en una sola cadena"
            aria-label="Fusionar rutas"
          >
            <span aria-hidden>⛓</span>
            <span className="ml-1.5 hidden md:inline">Fusionar rutas</span>
          </button>
        )}
        {canCreate(myRole) && (
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 rounded bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 md:px-3"
            title="Nueva ruta"
            aria-label="Nueva ruta"
          >
            <span aria-hidden>+</span>
            <span className="ml-1 hidden md:inline">Nueva ruta</span>
          </button>
        )}
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
