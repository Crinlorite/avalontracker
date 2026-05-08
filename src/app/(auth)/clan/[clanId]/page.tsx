"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { useClan } from "@/hooks/useClan";
import { useMe } from "@/hooks/useMe";
import { ClanGraph } from "@/components/graph/ClanGraph";
import { ZoneSidePanel } from "@/components/graph/ZoneSidePanel";
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
  const router = useRouter();
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(orientation: portrait)");
    const check = () => {
      if (mq.matches && window.innerWidth < 1024) router.replace(`/clan/${clanId}/list`);
    };
    check();
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, [clanId, router]);

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
    <div className="relative">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{clan?.name ?? "…"}</h1>
          <p className="text-xs text-slate-500">{routes.length} rutas activas · anchor: {anchorName ?? "—"}</p>
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
        <div className="mb-4">
          <AnchorStatusCard clan={clan} myRole={myRole} />
        </div>
      )}

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
