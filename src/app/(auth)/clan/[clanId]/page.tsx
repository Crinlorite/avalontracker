"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import toast from "react-hot-toast";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { useClan } from "@/hooks/useClan";
import { useMe } from "@/hooks/useMe";
import { ClanGraph } from "@/components/graph/ClanGraph";
import { ZoneSidePanel } from "@/components/graph/ZoneSidePanel";
import { ContextMenu, type ContextMenuOption } from "@/components/graph/ContextMenu";
import { HamburgerButton } from "@/components/layout/SidebarToggleContext";
import { CreateRouteModal } from "@/components/routes/CreateRouteModal";
import { AppendHopModal } from "@/components/routes/AppendHopModal";
import { MergeRoutesPicker } from "@/components/routes/MergeRoutesPicker";
import type { RouteView, HopView } from "@/hooks/useClanRoutes";
import { ViewToggle } from "@/components/clan/ViewToggle";
import { canCreate, canDelete } from "@/lib/role-ui";
import { AnchorStatusCard } from "@/components/clan/AnchorStatusCard";
import type { AppRole } from "@/generated/prisma/client";

// Discriminated union: el menú contextual cambia opciones según
// dónde fue el click derecho (zona / edge / timer).
type ContextMenuState =
  | { kind: "node"; x: number; y: number; zoneName: string }
  | { kind: "edge"; x: number; y: number; hop: HopView; routeId: string }
  | { kind: "timer"; x: number; y: number; hop: HopView; routeId: string };

// Cuotas de tiempo rápido para los menús contextuales (más cortos
// que los del modal — aquí queremos un par de clicks rápidos sin
// pensar). Coherentes entre edge y timer.
const QUICK_TIME_MINUTES = [30, 60, 120, 240] as const;

type ContextMenuActions = {
  startNewRoute: (zoneName: string) => void;
  branchInRoute: (route: RouteView, zoneName: string) => void;
  openSidePanel: (zoneName: string) => void;
  addTime: (routeId: string, hop: HopView, minutes: number) => void;
  deleteHopsCascadeAtZone: (zoneName: string) => void;
  deleteHop: (routeId: string, hop: HopView) => void;
};

// Calcula opciones del menú contextual según dónde se hizo el click
// derecho. Pure function — sin side effects ni state. Las acciones se
// inyectan vía `actions` para que la página haga el wiring con su
// state local (modales, side panel, fetch).
function buildContextMenuOptions({
  state,
  routes,
  anchorName,
  myRole,
  actions,
}: {
  state: ContextMenuState;
  routes: RouteView[];
  anchorName: string | null;
  myRole: AppRole | null;
  actions: ContextMenuActions;
}): ContextMenuOption[] {
  if (state.kind === "node") {
    const zone = state.zoneName;
    const isAnchor = anchorName === zone;
    const routesHere = routes.filter((r) =>
      r.hops.some((h) => h.fromZone.name === zone || h.toZone.name === zone),
    );
    const routesEntering = routes.filter((r) =>
      r.hops.some((h) => h.toZone.name === zone),
    );
    const opts: ContextMenuOption[] = [];
    if (canCreate(myRole)) {
      opts.push({
        icon: "+",
        label: "Nueva ruta desde aquí",
        onClick: () => actions.startNewRoute(zone),
      });
      if (routesHere.length === 1) {
        opts.push({
          icon: "🌿",
          label: `Ramificar desde ${zone}`,
          onClick: () => actions.branchInRoute(routesHere[0], zone),
        });
      } else if (routesHere.length > 1) {
        opts.push({
          icon: "🌿",
          label: `Ramificar (${routesHere.length} rutas) …`,
          onClick: () => actions.openSidePanel(zone),
        });
      }
    }
    // Borrar hop a la zona: solo si no es anchor, hay exactamente 1
    // ruta entrando (multi-ruta es ambigüo, lo deferimos al side
    // panel), y el user puede borrar.
    if (canDelete(myRole) && !isAnchor && routesEntering.length === 1) {
      const route = routesEntering[0];
      const sorted = [...route.hops].sort((a, b) => a.order - b.order);
      const entry = sorted.find((h) => h.toZone.name === zone);
      if (entry) {
        // Cuenta de cascada: hops alcanzables desde el entry siguiendo
        // toZone→fromZone hacia adelante. La cuenta acá es preview;
        // la acción recalcula al ejecutarse para evitar staleness.
        const cascade = new Set<number>([entry.id]);
        const queue = [entry];
        while (queue.length > 0) {
          const h = queue.shift()!;
          for (const cand of sorted) {
            if (cand.order <= h.order) continue;
            if (cand.fromZone.name === h.toZone.name && !cascade.has(cand.id)) {
              cascade.add(cand.id);
              queue.push(cand);
            }
          }
        }
        const downstream = cascade.size - 1;
        opts.push({
          icon: "🗑",
          variant: "danger",
          label: downstream > 0
            ? `Borrar hop a ${zone} (+${downstream} siguientes)`
            : `Borrar hop a ${zone}`,
          onClick: () => actions.deleteHopsCascadeAtZone(zone),
        });
      }
    }
    return opts;
  }

  if (state.kind === "edge") {
    const opts: ContextMenuOption[] = [];
    if (canCreate(myRole)) {
      for (const m of QUICK_TIME_MINUTES) {
        opts.push({
          icon: "⏱",
          label: `+${m < 60 ? `${m}m` : `${m / 60}h`}`,
          onClick: () => actions.addTime(state.routeId, state.hop, m),
        });
      }
    }
    if (canDelete(myRole)) {
      opts.push({
        icon: "🗑",
        variant: "danger",
        label: "Borrar este hop",
        onClick: () => actions.deleteHop(state.routeId, state.hop),
      });
    }
    return opts;
  }

  if (state.kind === "timer") {
    const opts: ContextMenuOption[] = [];
    if (canCreate(myRole)) {
      for (const m of QUICK_TIME_MINUTES) {
        opts.push({
          icon: "⏱",
          label: `+${m < 60 ? `${m}m` : `${m / 60}h`}`,
          onClick: () => actions.addTime(state.routeId, state.hop, m),
        });
      }
    }
    return opts;
  }

  return [];
}

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
  // Menú contextual unificado: discrimina entre node/edge/timer para
  // mostrar opciones distintas. Null = cerrado.
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Helper: añade N minutos al expiresAt del hop. Si está caducado lo
  // arranca desde "ahora", si no desde el expiresAt actual.
  async function addTimeToHop(routeId: string, hop: HopView, minutes: number) {
    const currentMs = new Date(hop.expiresAt).getTime();
    const baseMs = Math.max(currentMs, Date.now());
    const newExpiresAt = new Date(baseMs + minutes * 60_000).toISOString();
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/hops/${hop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: newExpiresAt }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Error");
      }
      toast.success(`+${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}`);
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  // Helper: borra una lista de hops del mismo routeId. El endpoint hace
  // soft-delete (recuperable 2 días desde la papelera).
  async function deleteHops(routeId: string, hopIds: number[], confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}?hops=${hopIds.join(",")}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message ?? "Error");
      }
      toast.success(hopIds.length === 1 ? "Hop borrado" : `${hopIds.length} hops borrados`);
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  // BFS por dependencia: a partir del entry hop (toZone == zona target)
  // sigue hacia adelante por matches de toZone→fromZone en orden
  // creciente. Orden creciente garantiza que no haya bucles. Devuelve el
  // entry hop + todos los hops downstream (sus dependientes en cadena).
  function computeCascadeFromZone(zone: string, route: RouteView): HopView[] {
    const sorted = [...route.hops].sort((a, b) => a.order - b.order);
    const entry = sorted.find((h) => h.toZone.name === zone);
    if (!entry) return [];
    const result = new Set<HopView>();
    const queue: HopView[] = [entry];
    while (queue.length > 0) {
      const h = queue.shift()!;
      if (result.has(h)) continue;
      result.add(h);
      for (const cand of sorted) {
        if (cand.order <= h.order) continue;
        if (cand.fromZone.name === h.toZone.name && !result.has(cand)) queue.push(cand);
      }
    }
    return [...result];
  }

  // Listener para click derecho en el timer del edge — RouteEdge
  // dispara CustomEvent para evitar pasar callbacks por todos los
  // edges. Distinto del edge-context-menu (que cubre el path SVG): el
  // timer NO ofrece borrar (sólo añadir tiempo).
  useEffect(() => {
    function handler(ev: Event) {
      const detail = (ev as CustomEvent<{ routeId: string; hopId: number; x: number; y: number }>).detail;
      if (!detail) return;
      const route = routes.find((r) => r.id === detail.routeId);
      const hop = route?.hops.find((h) => h.id === detail.hopId);
      if (route && hop) {
        setContextMenu({ kind: "timer", x: detail.x, y: detail.y, hop, routeId: route.id });
      }
    }
    window.addEventListener("avalon:timer-context-menu", handler);
    return () => window.removeEventListener("avalon:timer-context-menu", handler);
  }, [routes]);

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
    <div className="relative">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
        onNodeContextMenu={(event, name) => {
          setContextMenu({ kind: "node", x: event.clientX, y: event.clientY, zoneName: name });
        }}
        onEdgeContextMenu={(event, hop, routeId) => {
          setContextMenu({ kind: "edge", x: event.clientX, y: event.clientY, hop, routeId });
        }}
      />

      {contextMenu && (() => {
        const options: ContextMenuOption[] = buildContextMenuOptions({
          state: contextMenu,
          routes,
          anchorName: anchor?.name ?? null,
          myRole,
          actions: {
            startNewRoute: (z) => { setCreateFromZone(z); setShowCreate(true); },
            branchInRoute: (route, zoneName) => setBranchFrom({ route, zoneName }),
            openSidePanel: setSelectedZone,
            addTime: addTimeToHop,
            deleteHopsCascadeAtZone: (zone) => {
              const routesHere = routes.filter((r) => r.hops.some((h) => h.toZone.name === zone));
              if (routesHere.length !== 1) return;
              const route = routesHere[0];
              const cascade = computeCascadeFromZone(zone, route);
              if (cascade.length === 0) return;
              const downstream = cascade.length - 1;
              const msg = downstream > 0
                ? `¿Borrar el hop a "${zone}" y los ${downstream} hops siguientes en cadena? Soft-delete recuperable 2 días desde la papelera.`
                : `¿Borrar el hop a "${zone}"? Soft-delete recuperable 2 días desde la papelera.`;
              deleteHops(route.id, cascade.map((h) => h.id), msg);
            },
            deleteHop: (routeId, hop) => {
              deleteHops(routeId, [hop.id], `¿Borrar el hop "${hop.fromZone.name}" → "${hop.toZone.name}"? Soft-delete recuperable 2 días desde la papelera.`);
            },
          },
        });
        if (options.length === 0) return null;
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            options={options}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}

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
