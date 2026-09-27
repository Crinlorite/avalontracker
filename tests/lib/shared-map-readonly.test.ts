// El grafo de un enlace compartido es de solo lectura: el temporizador no
// abre el editor de tiempo (guardar fallaría con 401/403) ni lo anuncia.
import { it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EdgeProps } from "@xyflow/react";
import type { RouteView } from "@/hooks/useClanRoutes";

const graph = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("@/components/graph/ClanGraph", async (orig) => ({
  ...(await orig<typeof import("@/components/graph/ClanGraph")>()),
  ClanGraph: (p: Record<string, unknown>) => { graph.props = p; return null; },
}));
// Sin el lienzo de React Flow: la etiqueta del temporizador se pinta en línea.
vi.mock("@xyflow/react", async (orig) => ({
  ...(await orig<typeof import("@xyflow/react")>()),
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "en" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const hop = { id: 7, portalSize: 7, status: "ACTIVE", expiresAt: new Date(Date.now() + 3600e3).toISOString(), fromZone: { name: "A" }, toZone: { name: "B" } };
const routes = [{ id: "r1", hops: [hop] }] as unknown as RouteView[];

it("la vista compartida pinta el grafo en solo lectura", async () => {
  const { SharedMap } = await import("@/components/share/SharedMap");
  renderToStaticMarkup(createElement(SharedMap, {
    token: "A".repeat(22), role: "VIEWER", map: { id: "m", name: "M", anchorZone: null },
    initial: { routes, now: new Date().toISOString() },
  }));
  expect(graph.props?.readOnly).toBe(true);
});

it("en solo lectura el temporizador no abre el editor; fuera de ella, sí", async () => {
  const { hopToEdit } = await import("@/components/graph/ClanGraph");
  const detail = { routeId: "r1", hopId: 7 };
  expect(hopToEdit(routes, detail, false)).toEqual({ routeId: "r1", hop: routes[0].hops[0] });
  expect(hopToEdit(routes, detail, true)).toBeNull();
});

it("en solo lectura la etiqueta del temporizador no se ofrece para editar", async () => {
  const { RouteEdge } = await import("@/components/graph/RouteEdge");
  const edge = (readOnly: boolean) => renderToStaticMarkup(createElement(RouteEdge, {
    id: "e", source: "A", target: "B", sourceX: 0, sourceY: 0, targetX: 100, targetY: 0,
    data: { hop, routeId: "r1", readOnly },
  } as unknown as EdgeProps));
  expect(edge(false)).toContain("editar tiempo");
  expect(edge(true)).not.toContain("editar tiempo");
  expect(edge(true)).not.toContain("cursor-pointer");
});
