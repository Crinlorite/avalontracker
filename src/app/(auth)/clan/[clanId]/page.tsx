"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { useClan } from "@/hooks/useClan";
import { useMe } from "@/hooks/useMe";
import { ClanGraph } from "@/components/graph/ClanGraph";
import { ZoneSidePanel } from "@/components/graph/ZoneSidePanel";
import { HamburgerButton } from "@/components/layout/SidebarToggleContext";
import { CreateRouteModal } from "@/components/routes/CreateRouteModal";
import { AppendHopModal } from "@/components/routes/AppendHopModal";
import { MergeRoutesPicker } from "@/components/routes/MergeRoutesPicker";
import type { RouteView } from "@/hooks/useClanRoutes";
import { ViewToggle } from "@/components/clan/ViewToggle";
import { canCreate, canDelete } from "@/lib/role-ui";
import { AnchorStatusCard } from "@/components/clan/AnchorStatusCard";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function ClanGraphPage() {
  const { clanId } = useParams() as { clanId: string };
  const { clan } = useClan(clanId);
  const { routes, isLoading } = useClanRoutes(clanId);
  const { me } = useMe();
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const myRole: AppRole | null = members.find((m) => m.userId === me?.id)?.appRole ?? null;

  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createFromZone, setCreateFromZone] = useState<string | undefined>(undefined);
  const [showMerge, setShowMerge] = useState(false);
  const [branchFrom, setBranchFrom] = useState<{ route: RouteView; zoneName: string } | null>(null);

  // Auto-redirección a /list en mobile portrait quitada: el ViewToggle
  // permite al usuario elegir, y forzar lista hacía que cada click
  // en "Grafo" rebotara de vuelta. Con NODE_HEIGHT/WIDTH compactos y
  // fitView/maxZoom en ClanGraph, el grafo es usable en mobile aunque
  // sea pequeño (pinch-zoom de React Flow lo amplía).

  if (isLoading) return <div className="text-slate-400">Cargando grafo…</div>;

  // anchor: clan.anchorZone trae el metadata completo del API — se usa
  // para inyectar el nodo en el grafo incluso si ninguna ruta lo cruza
  // todavía. La info textual del anchor ya vive en el AnchorStatusCard,
  // no en el header.
  const anchor = clan?.anchorZone ?? null;

  const canMerge = canDelete(myRole) && routes.length >= 2;

  return (
    /*
      Flex-1 dentro del flex-col del auth layout — así toda la cadena
      es flex (sin porcentajes que requieran parent con altura
      explícita). Page wrapper crece al espacio disponible bajo el
      footer; header y anchor son shrink-0; el grafo se queda con lo
      que sobre. min-h-0 permite que el flex-1 baje de su contenido
      intrínseco si hace falta.
    */
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/*
        Header de una sola fila tanto mobile como desktop. Mobile:
        botones icon-only (emoji + tooltip), h1 más pequeño y
        truncado. Subtítulo "X rutas activas" oculto en mobile para
        no robar más alto al grafo. Quitada la mención al anchor —
        el AnchorStatusCard de abajo ya tiene esa info de sobra.
      */}
      <header className="mb-2 flex shrink-0 items-center gap-2 md:mb-4 md:gap-3">
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
            onClick={() => { setCreateFromZone(undefined); setShowCreate(true); }}
            className="shrink-0 rounded bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 md:px-3"
            title="Nueva ruta"
            aria-label="Nueva ruta"
          >
            <span aria-hidden>+</span>
            <span className="ml-1 hidden md:inline">Nueva ruta</span>
          </button>
        )}
      </header>

      {clan && clan.anchorZoneId && (
        <div className="mb-2 shrink-0 md:mb-4">
          <AnchorStatusCard clan={clan} myRole={myRole} />
        </div>
      )}

      {/*
        ClanGraph se renderiza directo (sin wrapper intermedio) — su
        outer div ya es `flex-1` y se estira a llenar el espacio
        sobrante del page wrapper. Wrapper extra con `h-full` rompía
        en desktop porque h-full dentro de flex-item necesita
        contexto que no siempre se resuelve.
      */}
      <ClanGraph
        clanId={clanId}
        routes={routes}
        anchor={anchor}
        anchorSecurityLevel={clan?.anchorSecurityLevel ?? null}
        onNodeClick={(name) => setSelectedZone(name)}
      />

      {selectedZone && (
        <ZoneSidePanel
          zoneName={selectedZone}
          routes={routes}
          onClose={() => setSelectedZone(null)}
          onCreateFromHere={() => {
            setCreateFromZone(selectedZone);
            setShowCreate(true);
          }}
          onBranchFromHere={(route) => setBranchFrom({ route, zoneName: selectedZone })}
          myRole={myRole}
        />
      )}

      {showCreate && (
        <CreateRouteModal
          clanId={clanId}
          defaultFromZone={createFromZone}
          onClose={() => { setShowCreate(false); setCreateFromZone(undefined); }}
          onCreated={() => { setShowCreate(false); setCreateFromZone(undefined); }}
        />
      )}
      {showMerge && (
        <MergeRoutesPicker
          clanId={clanId}
          routes={routes}
          onClose={() => setShowMerge(false)}
          onMerged={() => setShowMerge(false)}
        />
      )}
      {branchFrom && (
        <AppendHopModal
          clanId={clanId}
          route={branchFrom.route}
          defaultFromZone={branchFrom.zoneName}
          onClose={() => setBranchFrom(null)}
          onAdded={() => setBranchFrom(null)}
        />
      )}
    </div>
  );
}
