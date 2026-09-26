"use client";
import { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { secondsLeft, formatCountdown, colorForMinutes, minutesLeft } from "@/lib/time";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { AppRole } from "@/generated/prisma/client";
import { canCreate, canDelete } from "@/lib/role-ui";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import { AppendHopModal } from "./AppendHopModal";
import { MergeRoutesModal } from "./MergeRoutesModal";
import { RouteShareCard } from "./RouteShareCard";
import { copyOrDownloadNodeAsPng, captureNodeAsBlob } from "@/lib/routeImageExport";
import { splitRouteIntoPaths, pathRouteKey } from "@/lib/routePaths";
import { useParams } from "next/navigation";

export function RouteListTable({ routes, myRole }: { routes: RouteView[]; myRole: AppRole | null }) {
  const { clanId } = useParams() as { clanId: string };
  const [appendTo, setAppendTo] = useState<RouteView | null>(null);
  const [mergeInto, setMergeInto] = useState<RouteView | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushTarget, setPushTarget] = useState<RouteView | null>(null);
  const [headerDraft, setHeaderDraft] = useState("");
  const [imageRoute, setImageRoute] = useState<RouteView | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);

  // (botón "Disable" quitado: el flujo correcto es Borrar → soft-delete
  // recuperable 2 días, no un estado intermedio "deshabilitada".)

  // Borrado consciente del split en paths:
  // - Si la fila representa una Route entera (sin bifurcaciones, o
  //   path único): borra la Route completa como antes.
  // - Si la fila es UN path de una Route con varios caminos: borra
  //   solo los hops EXCLUSIVOS de ese path (no compartidos con otros
  //   hermanos), preservando los demás caminos.
  async function del(pathRoute: RouteView) {
    const siblings = pathsByRoute.get(pathRoute.id) ?? [pathRoute];
    const isFullRoute = siblings.length <= 1;

    let confirmMsg: string;
    let url: string;
    let exclusiveCount = 0;

    if (isFullRoute) {
      confirmMsg = "¿Borrar esta ruta? Quedará en papelera 7 días antes del borrado definitivo.";
      url = `/api/clans/${clanId}/routes/${pathRoute.id}`;
    } else {
      // Hops únicos de este path (no en ningún hermano).
      const otherHopIds = new Set<number>();
      for (const sib of siblings) {
        if (sib === pathRoute) continue;
        for (const h of sib.hops) otherHopIds.add(h.id);
      }
      const exclusive = pathRoute.hops.map((h) => h.id).filter((id) => !otherHopIds.has(id));
      if (exclusive.length === 0) {
        toast.error("Este camino comparte todos sus hops con otros — no hay nada exclusivo que borrar");
        return;
      }
      exclusiveCount = exclusive.length;
      confirmMsg = `¿Borrar este camino? (${exclusiveCount} hop${exclusiveCount > 1 ? "s" : ""} único${exclusiveCount > 1 ? "s" : ""}; recuperable 2 días, el resto de la ruta intacto)`;
      url = `/api/clans/${clanId}/routes/${pathRoute.id}?hops=${exclusive.join(",")}`;
    }

    if (!confirm(confirmMsg)) return;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      toast.success(isFullRoute ? "Ruta borrada" : `Camino borrado (${exclusiveCount} hop${exclusiveCount > 1 ? "s" : ""})`);
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
    } else {
      toast.error("Error");
    }
  }

  async function confirmPush() {
    if (!pushTarget) return;
    const route = pushTarget;
    const header = headerDraft.trim();
    setPushingId(route.id);
    setPushTarget(null);
    setHeaderDraft("");

    // Generamos la imagen del share-card off-screen ANTES del POST. Si
    // la generación falla, mandamos el push sin imagen (degraded mode)
    // — el header + embed siguen siendo útiles.
    setImageRoute(route);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    let imageBlob: Blob | null = null;
    try {
      if (shareCardRef.current) {
        imageBlob = await captureNodeAsBlob(shareCardRef.current);
      }
    } catch (e) {
      console.warn("share-card capture failed:", e);
    } finally {
      setImageRoute(null);
    }

    try {
      const fd = new FormData();
      if (header) fd.set("headerText", header);
      if (imageBlob) fd.set("image", imageBlob, "route.png");
      // hopIds: si la route ha sido split en paths (bifurcación
      // interna), pushTarget.hops es un subset. Mandamos los IDs para
      // que el server filtre el embed al path correcto y no incluya
      // hops de hermanos. Para routes sin bifurcaciones, mandar los
      // IDs es benigno (= todos los hops del route).
      fd.set("hopIds", JSON.stringify(route.hops.map((h) => h.id)));
      const res = await fetch(`/api/clans/${clanId}/routes/${route.id}/discord-push`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error?.message ?? "Error enviando a Discord");
      } else if (imageBlob && body?.imageSent === false) {
        toast.success("Ruta enviada (imagen no se pudo subir)");
      } else {
        toast.success(imageBlob ? "Ruta + imagen enviadas a Discord" : "Enviada a Discord");
      }
    } catch {
      toast.error("Error de red");
    } finally {
      setPushingId(null);
    }
  }

  async function copyAsImage(route: RouteView) {
    setCopyingId(route.id);
    setImageRoute(route);
    // Esperar a que el portal monte y se pinte el card off-screen.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    try {
      if (!shareCardRef.current) throw new Error("share card no montada");
      const result = await copyOrDownloadNodeAsPng(shareCardRef.current, `route-${route.id}`);
      toast.success(
        result === "clipboard"
          ? "Imagen copiada — pega con Ctrl+V en Discord"
          : "Imagen descargada (clipboard no disponible)",
      );
    } catch (err) {
      toast.error("Error generando imagen");
      console.warn("copyAsImage:", err);
    } finally {
      setImageRoute(null);
      setCopyingId(null);
    }
  }

  const canEdit = canCreate(myRole);
  const canDel = canDelete(myRole);
  const canMerge = canDel; // Merge requiere EDITOR+ (borra la ruta source).
  const hasActions = canEdit || canDel;
  // Una Route con bifurcaciones internas (varios hops desde el mismo
  // zone) se descompone en N path-routes lineales. Cada path es una
  // fila independiente, con su propio botón de Discord push: así se
  // pueden enviar al canal por separado en lugar de embarrar el
  // mensaje con todos los caminos mezclados.
  //
  // Mantenemos un Map routeId → paths para que `del()` pueda detectar
  // si el path-route que se está borrando tiene hermanos (otros paths
  // de la misma Route): si los tiene, borrado parcial; si no, borra
  // la Route entera.
  const pathsByRoute = useMemo(() => {
    const m = new Map<string, RouteView[]>();
    for (const r of routes) m.set(r.id, splitRouteIntoPaths(r));
    return m;
  }, [routes]);
  const pathRoutes = useMemo(
    () => Array.from(pathsByRoute.values()).flat(),
    [pathsByRoute],
  );

  return (
    <div className="space-y-4">
      {pathRoutes.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Sin rutas activas.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Cadena</th>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creada por</th>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Próximo vencimiento</th>
                {hasActions && <th className="px-3 py-2 text-right text-xs uppercase text-slate-400">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {pathRoutes.map((r) => {
                const nextExpiry = r.hops.filter((h) => h.status === "ACTIVE").sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
                const mins = nextExpiry ? minutesLeft(nextExpiry.expiresAt) : -1;
                const canAppend = canEdit && r.hops.length < 12;
                return (
                  <tr key={pathRouteKey(r)} className="align-top">
                    <td className="px-3 py-3">
                      {/*
                        Mobile: una fila por hop (stack vertical). Con 6+
                        hops y nombres de zona largos, el flex-wrap
                        horizontal del desktop produce wraps irregulares
                        que cuesta leer. En móvil cada hop ocupa su
                        propia fila — más alto pero predecible.
                        Desktop: flex-wrap inline como antes.
                      */}
                      <div className="flex flex-col gap-0.5 text-sm md:flex-row md:flex-wrap md:items-center md:gap-1">
                        {r.hops.map((h, i) => (
                          <span key={h.id} className="flex items-center gap-1">
                            {i === 0 && <span className="text-white">{h.fromZone.name}</span>}
                            <span className="text-slate-500">→</span>
                            <span className="text-white">{h.toZone.name}</span>
                            <span className="rounded bg-slate-800 px-1 text-[10px] text-slate-300">{h.portalSize}</span>
                          </span>
                        ))}
                      </div>
                      {r.notes && <div className="mt-1 text-xs italic text-slate-500">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-3 text-slate-300">{r.createdBy.displayName ?? r.createdBy.globalNickname ?? r.createdBy.discordUsername}</td>
                    <td className="px-3 py-3">
                      {nextExpiry ? (
                        <span style={{ color: colorForMinutes(mins) }} className="font-mono">
                          {formatCountdown(secondsLeft(nextExpiry.expiresAt))}
                        </span>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                    {hasActions && (
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {canEdit && (
                            <button
                              onClick={() => { setPushTarget(r); setHeaderDraft(""); }}
                              disabled={pushingId === r.id}
                              className="rounded bg-indigo-600/80 px-2 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
                              title="Enviar ruta al canal Discord del clan"
                            >
                              {pushingId === r.id ? "…" : "📨 Discord"}
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => copyAsImage(r)}
                              disabled={copyingId === r.id}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                              title="Copiar la ruta como imagen al portapapeles (pegar en Discord con Ctrl+V)"
                            >
                              {copyingId === r.id ? "…" : "📷 Imagen"}
                            </button>
                          )}
                          {canAppend && (
                            <button
                              onClick={() => setAppendTo(r)}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                              title="Añadir hop al final de la ruta"
                            >
                              + Hop
                            </button>
                          )}
                          {canMerge && routes.length > 1 && (
                            <button
                              onClick={() => setMergeInto(r)}
                              className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                              title="Fusionar otra ruta dentro de esta"
                            >
                              ⛓ Fusionar
                            </button>
                          )}
                          {canDel && (
                            <button
                              onClick={() => del(r)}
                              className="text-xs text-red-400 hover:text-red-300"
                              title={
                                (pathsByRoute.get(r.id)?.length ?? 1) > 1
                                  ? "Borrar este camino (preserva los hermanos)"
                                  : "Borrar la ruta completa"
                              }
                            >
                              Borrar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {appendTo && (
        <AppendHopModal
          clanId={clanId}
          route={appendTo}
          onClose={() => setAppendTo(null)}
          onAdded={() => setAppendTo(null)}
        />
      )}
      {mergeInto && (
        <MergeRoutesModal
          clanId={clanId}
          targetRoute={mergeInto}
          candidateRoutes={routes.filter((r) => r.id !== mergeInto.id)}
          onClose={() => setMergeInto(null)}
          onMerged={() => setMergeInto(null)}
        />
      )}

      {pushTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setPushTarget(null); setHeaderDraft(""); }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); confirmPush(); }}
            className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6"
          >
            <h2 className="text-lg font-bold text-white">Enviar a Discord</h2>
            <p className="text-xs text-slate-400">
              Se mostrará como <span className="font-bold text-slate-200">título grande</span> encima del embed.
              Si empiezas el texto con <code className="rounded bg-slate-800 px-1">##</code> o{" "}
              <code className="rounded bg-slate-800 px-1">###</code> usarás un tamaño menor. Déjalo vacío para no añadir encabezado.
            </p>
            <label className="block">
              <span className="text-sm text-slate-300">Encabezado (opcional)</span>
              <input
                autoFocus
                value={headerDraft}
                onChange={(e) => setHeaderDraft(e.target.value)}
                maxLength={100}
                placeholder="Ej: Thetford Portal"
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <span className="mt-1 block text-right text-[10px] text-slate-500">{headerDraft.length}/100</span>
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => { setPushTarget(null); setHeaderDraft(""); }}
                className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Enviar
              </button>
            </div>
          </form>
        </div>
      )}

      {imageRoute && typeof document !== "undefined" &&
        createPortal(
          // Portal off-screen para capturar el card sin que sea visible
          // al usuario. position fixed + left -10000px lo saca del
          // viewport pero deja la geometría intacta para html-to-image.
          <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
            <RouteShareCard ref={shareCardRef} route={imageRoute} />
          </div>,
          document.body,
        )}
    </div>
  );
}
