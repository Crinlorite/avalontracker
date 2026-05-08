"use client";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { useZoneRouting } from "@/hooks/useZoneRouting";
import { ZoneBadges } from "@/components/zones/ZoneBadges";
import { HopInlineToolbar } from "@/components/graph/HopInlineToolbar";
import { canCreate } from "@/lib/role-ui";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { ZoneSuggestion } from "@/hooks/useZoneSearch";
import type { AppRole } from "@/generated/prisma/client";

export function ZoneSidePanel({
  zoneName, routes, onClose, onCreateFromHere, onBranchFromHere, myRole,
}: {
  zoneName: string; routes: RouteView[]; onClose: () => void;
  onCreateFromHere: () => void;
  onBranchFromHere?: (route: RouteView) => void;
  myRole: AppRole | null;
}) {
  const { clanId } = useParams() as { clanId: string };
  const { data: suggestion } = useSWR<ZoneSuggestion[]>(`/api/zones?q=${encodeURIComponent(zoneName)}`);
  const zone = (suggestion ?? []).find((z) => z.name === zoneName);
  const { routing, isLoading: routingLoading } = useZoneRouting(zone?.id ?? null);

  const routesHere = routes.filter((r) =>
    r.hops.some((h) => h.fromZone.name === zoneName || h.toZone.name === zoneName)
  );

  const canCreateHere = canCreate(myRole);

  return (
    <aside className="fixed right-0 top-0 z-30 flex h-full w-[420px] max-w-[90vw] flex-col border-l border-slate-800 bg-slate-950 p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{zoneName}</h2>
          {zone && <ZoneBadges zone={zone} />}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {(zone?.type === "AVALON" || zone?.type === "ROYAL") && (
        <section className="mb-4 rounded border border-slate-800 bg-slate-900 p-3">
          <h3 className="mb-2 text-xs uppercase text-slate-400">Pathfinding</h3>
          {routingLoading && <div className="text-sm text-slate-500">Calculando…</div>}
          {!routingLoading && routing && (
            <div className="space-y-1 text-sm">
              {routing.nearestCapital ? (
                <div>Ciudad más cerca: <span className="font-semibold text-white">{routing.nearestCapital.zone.name}</span> <span className="text-slate-400">({routing.nearestCapital.hops} hops)</span></div>
              ) : <div className="text-slate-500">Sin ciudad cercana</div>}
              {zone?.type === "AVALON" && (
                routing.nearestRoyal ? (
                  <div>Salida royal: <span className="font-semibold text-white">{routing.nearestRoyal.zone.name}</span> <span className="text-slate-400">({routing.nearestRoyal.hops} hops)</span></div>
                ) : <div className="text-slate-500">Sin salida royal calculada</div>
              )}
              {routing.nearestRest ? (
                <div>Rest más cerca: <span className="font-semibold text-white">{routing.nearestRest.zone.name}</span> <span className="text-slate-400">({routing.nearestRest.hops} hops)</span></div>
              ) : <div className="text-slate-500">Sin rest cercano</div>}
            </div>
          )}
        </section>
      )}

      <section className="mb-4 flex-1 overflow-y-auto">
        <h3 className="mb-2 text-xs uppercase text-slate-400">Rutas que pasan por aquí ({routesHere.length})</h3>
        {routesHere.length === 0 ? (
          <div className="text-sm text-slate-500">Ninguna</div>
        ) : (
          <ul className="space-y-2">
            {routesHere.map((r) => (
              <li key={r.id} className="rounded border border-slate-800 bg-slate-900 p-2 text-xs">
                <div className="font-mono text-slate-300">
                  {r.hops.map((h, i) => (
                    <span key={h.id}>
                      {i === 0 && h.fromZone.name}
                      <span className="text-slate-500"> → </span>
                      {h.toZone.name}
                    </span>
                  ))}
                </div>
                {r.notes && <div className="mt-1 italic text-slate-500">{r.notes}</div>}
                {canCreateHere && onBranchFromHere && (
                  <button
                    onClick={() => onBranchFromHere(r)}
                    className="mt-2 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                    title={`Añadir una rama nueva desde ${zoneName} a esta ruta`}
                  >
                    + Ramificar desde {zoneName}
                  </button>
                )}
                {canCreateHere && (
                  <ul className="mt-2 space-y-1">
                    {r.hops.filter((h) => h.fromZone.name === zoneName || h.toZone.name === zoneName).map((h) => (
                      <li key={`tb-${h.id}`} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">{h.fromZone.name} → {h.toZone.name}</span>
                        <HopInlineToolbar clanId={clanId} routeId={r.id} hop={h} myRole={myRole} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canCreateHere && (
        <button onClick={onCreateFromHere} className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          + Crear ruta desde aquí
        </button>
      )}
    </aside>
  );
}
