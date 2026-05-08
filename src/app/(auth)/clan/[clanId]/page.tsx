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

  // anchor: clan.anchorZone trae el metadata completo del API — lo usamos
  // tanto para el label del header como para inyectar el nodo en el grafo
  // incluso si aún no hay rutas que lo crucen. Si no hay anchor configurado,
  // derivamos un fallback name desde la primera hop para el header.
  const anchor = clan?.anchorZone ?? null;
  const anchorName = anchor?.name
    ?? routes.flatMap((r) => r.hops).find((h) => h.fromZone.id === clan?.anchorZoneId)?.fromZone.name
    ?? routes.flatMap((r) => r.hops).find((h) => h.toZone.id === clan?.anchorZoneId)?.toZone.name
    ?? null;

  const canMerge = canDelete(myRole) && routes.length >= 2;

  return (
    /*
      Flex column atado a la altura visible del viewport (`100dvh`
      menos el padding del auth layout: 32px mobile = p-4 dos veces,
      64px desktop = p-8 dos veces). Header y AnchorStatusCard son
      `shrink-0` con su altura natural; el grafo es `flex-1` y se
      come lo que sobra. Así no dependemos de calcular a mano cuánto
      mide el chrome — si la URL bar de iOS aparece/desaparece, si
      el header wrapea por buttons largos, si no hay anchor card,
      todo se ajusta solo. El `min-h-0` en el wrapper del grafo
      evita que el contenido interno fuerce a crecer al flex-1
      (default min-h en flexbox es auto, no 0).
    */
    <div className="relative flex h-[calc(100dvh-32px)] flex-col md:h-[calc(100dvh-64px)]">
      <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 md:mb-4">
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
              onClick={() => { setCreateFromZone(undefined); setShowCreate(true); }}
              className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              + Nueva ruta
            </button>
          )}
        </div>
      </header>

      {clan && clan.anchorZoneId && (
        <div className="mb-3 shrink-0 md:mb-4">
          <AnchorStatusCard clan={clan} myRole={myRole} />
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ClanGraph
          clanId={clanId}
          routes={routes}
          anchor={anchor}
          anchorSecurityLevel={clan?.anchorSecurityLevel ?? null}
          onNodeClick={(name) => setSelectedZone(name)}
        />
      </div>

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
