"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { useClan } from "@/hooks/useClan";
import { useMe } from "@/hooks/useMe";
import { ClanGraph } from "@/components/graph/ClanGraph";
import { ZoneSidePanel } from "@/components/graph/ZoneSidePanel";
import { CreateRouteModal } from "@/components/routes/CreateRouteModal";
import { canCreate } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function ClanGraphPage() {
  const { clanId } = useParams() as { clanId: string };
  const router = useRouter();
  const { clan } = useClan(clanId);
  const { routes, isLoading } = useClanRoutes(clanId);
  const { me } = useMe();
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const myRole = members.find((m) => m.userId === me?.id)?.appRole ?? null;

  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  const anchorName = clan?.anchorZoneId
    ? routes.flatMap((r) => r.hops).find((h) => h.fromZone.id === clan.anchorZoneId)?.fromZone.name
      ?? routes.flatMap((r) => r.hops).find((h) => h.toZone.id === clan.anchorZoneId)?.toZone.name
      ?? null
    : null;

  return (
    <div className="relative">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{clan?.name ?? "…"}</h1>
          <p className="text-xs text-slate-500">{routes.length} rutas activas · anchor: {anchorName ?? "—"}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/clan/${clanId}/list`} className="rounded border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Vista lista</Link>
          {canCreate(myRole) && (
            <button onClick={() => setShowCreate(true)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">+ Nueva ruta</button>
          )}
        </div>
      </header>

      <ClanGraph routes={routes} anchorZoneName={anchorName} onNodeClick={(name) => setSelectedZone(name)} />

      {selectedZone && (
        <ZoneSidePanel
          zoneName={selectedZone}
          routes={routes}
          onClose={() => setSelectedZone(null)}
          onCreateFromHere={() => { setShowCreate(true); }}
          myRole={myRole}
        />
      )}

      {showCreate && <CreateRouteModal clanId={clanId} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
    </div>
  );
}
