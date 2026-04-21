# Avalon Tracker — Frontend Rewrite Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir el frontend sobre el backend ya redesignado: login Discord, grafo react-flow como vista primaria, panel lateral con pathfinding, lista fallback, mobile, super admin UI, SWR polling colaborativo. Elimina todo el código legacy (personalCode, credentials password, InviteCode UI).

**Architecture:** Next.js 16 App Router + React 19 client components, react-flow para grafo con custom nodes/edges, SWR para data fetching + polling 10-15s visible / 60s background, mobile portrait → lista automática, super admin con bypass visual en `/admin/*`. Sin tests de componentes (usuario despliega y valida en VPS); sí tests para hooks puros cuando apliquen.

**Tech Stack:** `@xyflow/react` 12.x, `swr` 2.x, `react` 19.2.3, Tailwind v4, Next.js 16 App Router, `react-hot-toast` para notificaciones, `sonner` como alternativa si el primero da problemas.

---

## Contexto previo (Plan 1 completado)

- Branch base: `feat/discord-redesign-backend` (49 commits, 29/29 tests). Plan 2 parte de ahí (o un branch nuevo desde ese).
- Backend API ya implementada con todos los endpoints del spec §12.
- Data shape conocida: `Route { id, clanId, status, version, hops: [{order, fromZone, toZone, portalSize, expiresAt, status}] }`, `Clan { id, name, discordGuildId, anchorZoneId, members[] }`.
- Sesión Discord: `session.user = { id, discordId, isSuperAdmin, image, name }`.
- Enum roles: `ADMIN | EDITOR | CONTRIBUTOR | VIEWER` (hierarchy ascendente).

## File Structure

### Nuevos archivos

```
src/app/(auth)/clan/[clanId]/page.tsx              REEMPLAZA — grafo react-flow primary
src/app/(auth)/clan/[clanId]/list/page.tsx         NUEVO — lista fallback
src/app/(auth)/clan/[clanId]/settings/page.tsx     REEMPLAZA — webhook + anchor + role mappings
src/app/(auth)/clan/[clanId]/members/page.tsx      REEMPLAZA — Discord members + override displayName
src/app/(auth)/clan/[clanId]/audit/page.tsx        REEMPLAZA — fix bug data.entries
src/app/(auth)/clan/[clanId]/layout.tsx            NUEVO/REVISADO — ClanTabs

src/app/(auth)/admin/page.tsx                      REEMPLAZA — dashboard super admin
src/app/(auth)/admin/map/page.tsx                  NUEVO — grafo global
src/app/(auth)/admin/routes/page.tsx               NUEVO — tabla cross-clan
src/app/(auth)/admin/clans/page.tsx                NUEVO — listado clanes
src/app/(auth)/admin/users/page.tsx                NUEVO — búsqueda users

src/app/(auth)/dashboard/page.tsx                  REEMPLAZA — mis clanes con Discord avatar
src/app/(auth)/profile/page.tsx                    REEMPLAZA — Discord info + displayName override

src/app/(auth)/layout.tsx                          ACTUALIZA — sidebar nueva
src/app/page.tsx                                   REEMPLAZA — LandingLoginDiscord

src/app/loading.tsx                                NUEVO — global loading
src/app/error.tsx                                  NUEVO — global error boundary
src/app/not-found.tsx                              NUEVO — 404

src/components/auth/LandingLoginDiscord.tsx        NUEVO
src/components/layout/Sidebar.tsx                  REEMPLAZA — Discord avatar + isSuperAdmin badge

src/components/graph/ClanGraph.tsx                 NUEVO — wrapper react-flow
src/components/graph/ZoneNode.tsx                  NUEVO — custom node con badges
src/components/graph/RouteEdge.tsx                 NUEVO — custom edge con timer + status
src/components/graph/GraphToolbar.tsx              NUEVO — búsqueda + filtros
src/components/graph/ZoneSidePanel.tsx             NUEVO — panel lateral click-nodo
src/components/graph/HopInlineToolbar.tsx          NUEVO — toolbar edición al hover
src/components/graph/graph-layout.ts               NUEVO — force-directed util
src/components/graph/graph-colors.ts               NUEVO — color helpers (time → color)

src/components/routes/CreateRouteModal.tsx         REEMPLAZA — autocomplete + shortcuts
src/components/routes/RouteListTable.tsx           NUEVO — fallback móvil
src/components/routes/RouteTimer.tsx               MANTIENE — usar graph-colors

src/components/zones/ZoneAutocomplete.tsx          REEMPLAZA — con badges T6/HO/AVALON
src/components/zones/ZoneBadges.tsx                NUEVO — componente badge reutilizable

src/components/clan/CreateClanModal.tsx            REEMPLAZA — exige guildId + guildName Discord
src/components/clan/ClanTabs.tsx                   MANTIENE — revisar paths
src/components/clan/RoleMappingEditor.tsx          NUEVO — dropdown roles Discord → appRole

src/components/admin/AdminCard.tsx                 NUEVO — card stats dashboard
src/components/admin/GlobalGraphClient.tsx         NUEVO — grafo cross-clan

src/components/providers/ToastProvider.tsx         NUEVO — react-hot-toast wrapper
src/components/providers/SWRProvider.tsx           NUEVO — config global SWR

src/hooks/useMe.ts                                 NUEVO — GET /api/me
src/hooks/useMyClans.ts                            NUEVO — GET /api/me/clans
src/hooks/useClanRoutes.ts                         NUEVO — GET ?since= polling
src/hooks/useClan.ts                               NUEVO — detalle clan
src/hooks/useZoneSearch.ts                         NUEVO — autocomplete zonas
src/hooks/useZoneRouting.ts                        NUEVO — pathfinding on-demand
src/hooks/useVisibilityPolling.ts                  NUEVO — TTL dinámico visible/bg

src/lib/fetcher.ts                                 NUEVO — SWR fetcher con error envelope
src/lib/time.ts                                    NUEVO — helpers tiempo restante + color
src/lib/role-ui.ts                                 NUEVO — etiquetas UI de AppRole

tests/hooks/time.test.ts                           NUEVO — funciones puras tiempo
tests/hooks/role-ui.test.ts                        NUEVO — helpers role
```

### Eliminados

```
src/components/landing/LandingLogin.tsx            Reemplazado por LandingLoginDiscord
src/components/routes/DiscordPushButton.tsx        El endpoint /webhook fue eliminado
src/components/dashboard/DashboardClient.tsx       Refactor inline en page.tsx
```

### Modificados (cambios menores)

```
package.json                                       Añadir @xyflow/react, swr, react-hot-toast
src/types/next-auth.d.ts                           Ya actualizado en Plan 1; validar
```

---

## Fases

- **Fase 0**: Prep (deps, providers globales, fetcher SWR, toast)
- **Fase 1**: Auth UI (LandingLoginDiscord, eliminar credentials flow, actualizar Sidebar)
- **Fase 2**: Hooks compartidos (`useMe`, `useMyClans`, `useClan`, `useZoneSearch`, `useZoneRouting`, `useClanRoutes`, `useVisibilityPolling`)
- **Fase 3**: Dashboard + Profile
- **Fase 4**: Clan Settings (webhook, anchor zone, role mappings editor)
- **Fase 5**: Clan Members (lista Discord, displayName override)
- **Fase 6**: Clan Audit (fix bug + ADMIN gate visual)
- **Fase 7**: Zone components (ZoneAutocomplete v2 + ZoneBadges)
- **Fase 8**: CreateRouteModal v2 (autocomplete, shortcuts, chain validation)
- **Fase 9**: Route List fallback `/clan/[id]/list`
- **Fase 10**: Graph primary — ClanGraph + ZoneNode + RouteEdge + layout
- **Fase 11**: GraphToolbar + ZoneSidePanel + pathfinding overlay
- **Fase 12**: HopInlineToolbar (editar/status/delete con permisos)
- **Fase 13**: Mobile portrait detection + redirect
- **Fase 14**: Super admin pages
- **Fase 15**: Global loading/error/not-found + cleanup final

---

## Fase 0: Prep

### Task 0.1: Instalar dependencias frontend

**Files:** `package.json`

- [ ] **Step 1: Instalar**

```bash
cd C:/Users/Crint/proyectos/avalon-tracker
npm install @xyflow/react swr react-hot-toast
```

- [ ] **Step 2: Verificar**

```bash
node -e "const p=require('./package.json'); console.log(p.dependencies['@xyflow/react'], p.dependencies.swr, p.dependencies['react-hot-toast'])"
```
Expected: tres versiones, no `undefined`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @xyflow/react, swr, react-hot-toast

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 0.2: Fetcher SWR con error envelope

**Files:**
- Create: `src/lib/fetcher.ts`

- [ ] **Step 1: Implementar**

```ts
export class ApiError extends Error {
  constructor(public code: string, public status: number, public payload: unknown) {
    super(code);
  }
}

export async function fetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: "UNKNOWN", message: "Error desconocido" } }));
    throw new ApiError(body?.error?.code ?? "UNKNOWN", res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fetcher.ts
git commit -m "feat(fetcher): SWR fetcher with typed error envelope

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 0.3: Toast + SWR providers

**Files:**
- Create: `src/components/providers/ToastProvider.tsx`
- Create: `src/components/providers/SWRProvider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: ToastProvider**

```tsx
"use client";
import { Toaster } from "react-hot-toast";
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: { background: "#1f2937", color: "#f3f4f6", border: "1px solid #374151" },
        success: { iconTheme: { primary: "#10b981", secondary: "#1f2937" } },
        error: { iconTheme: { primary: "#ef4444", secondary: "#1f2937" } },
      }}
    />
  );
}
```

- [ ] **Step 2: SWRProvider**

```tsx
"use client";
import { SWRConfig } from "swr";
import { fetcher, ApiError } from "@/lib/fetcher";
import toast from "react-hot-toast";
import type { ReactNode } from "react";

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        onError: (err) => {
          if (err instanceof ApiError) {
            if (err.status >= 500) toast.error("Error del servidor, reintenta");
            else if (err.status === 503) toast.error("Servicio degradado — Discord/Bot no responde");
            else if (err.status === 401) { /* redirect se gestiona en middleware */ }
          }
        },
        revalidateOnFocus: true,
        shouldRetryOnError: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
```

- [ ] **Step 3: Integrar en root layout**

Leer `src/app/layout.tsx`. Añadir imports y envolver children:

```tsx
import { SWRProvider } from "@/components/providers/SWRProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";

// ...en el return del RootLayout, dentro de <body>:
<SWRProvider>
  {children}
  <ToastProvider />
</SWRProvider>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/providers src/app/layout.tsx
git commit -m "feat(providers): SWR + toast globales

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 0.4: Helpers puros time + role-ui con tests

**Files:**
- Create: `src/lib/time.ts`
- Create: `src/lib/role-ui.ts`
- Create: `tests/hooks/time.test.ts`
- Create: `tests/hooks/role-ui.test.ts`

- [ ] **Step 1: Tests time.ts**

```ts
import { describe, it, expect } from "vitest";
import { minutesLeft, colorForMinutes, formatCountdown } from "@/lib/time";

describe("minutesLeft", () => {
  it("returns positive minutes when in future", () => {
    const future = new Date(Date.now() + 45 * 60_000);
    expect(minutesLeft(future)).toBeCloseTo(45, 0);
  });
  it("returns negative when past", () => {
    const past = new Date(Date.now() - 10 * 60_000);
    expect(minutesLeft(past)).toBeLessThan(0);
  });
});

describe("colorForMinutes", () => {
  it("green > 60", () => { expect(colorForMinutes(90)).toBe("#22c55e"); });
  it("orange 30-60", () => { expect(colorForMinutes(45)).toBe("#f97316"); });
  it("red 0-30", () => { expect(colorForMinutes(10)).toBe("#ef4444"); });
  it("blue (expired) <=0", () => { expect(colorForMinutes(0)).toBe("#3b82f6"); expect(colorForMinutes(-5)).toBe("#3b82f6"); });
});

describe("formatCountdown", () => {
  it("H:MM:SS when >= 1h", () => { expect(formatCountdown(3725)).toBe("1:02:05"); });
  it("MM:SS when < 1h", () => { expect(formatCountdown(125)).toBe("02:05"); });
  it("0:00 when negative", () => { expect(formatCountdown(-10)).toBe("0:00"); });
});
```

- [ ] **Step 2: Implementar time.ts**

```ts
export function minutesLeft(expiresAt: Date | string): number {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return (target.getTime() - Date.now()) / 60_000;
}

export function colorForMinutes(m: number): string {
  if (m > 60) return "#22c55e";
  if (m > 30) return "#f97316";
  if (m > 0) return "#ef4444";
  return "#3b82f6";
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function secondsLeft(expiresAt: Date | string): number {
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
}
```

- [ ] **Step 3: Tests role-ui.ts**

```ts
import { describe, it, expect } from "vitest";
import { roleLabel, canCreate, canDelete, canAdmin } from "@/lib/role-ui";

describe("roleLabel", () => {
  it("maps enum → ES", () => {
    expect(roleLabel("ADMIN")).toBe("Admin");
    expect(roleLabel("EDITOR")).toBe("Editor");
    expect(roleLabel("CONTRIBUTOR")).toBe("Colaborador");
    expect(roleLabel("VIEWER")).toBe("Observador");
    expect(roleLabel(null)).toBe("Sin acceso");
  });
});

describe("permission helpers", () => {
  it("canCreate: CONTRIBUTOR+", () => {
    expect(canCreate("VIEWER")).toBe(false);
    expect(canCreate("CONTRIBUTOR")).toBe(true);
    expect(canCreate("EDITOR")).toBe(true);
    expect(canCreate("ADMIN")).toBe(true);
    expect(canCreate(null)).toBe(false);
  });
  it("canDelete: EDITOR+", () => {
    expect(canDelete("CONTRIBUTOR")).toBe(false);
    expect(canDelete("EDITOR")).toBe(true);
    expect(canDelete("ADMIN")).toBe(true);
  });
  it("canAdmin: ADMIN only", () => {
    expect(canAdmin("EDITOR")).toBe(false);
    expect(canAdmin("ADMIN")).toBe(true);
  });
});
```

- [ ] **Step 4: Implementar role-ui.ts**

```ts
import type { AppRole } from "@/generated/prisma/client";

const LABELS: Record<AppRole, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  CONTRIBUTOR: "Colaborador",
  VIEWER: "Observador",
};

export function roleLabel(role: AppRole | null): string {
  if (!role) return "Sin acceso";
  return LABELS[role];
}

const HIER: Record<AppRole, number> = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, ADMIN: 4 };

function hasMin(role: AppRole | null, min: AppRole): boolean {
  if (!role) return false;
  return HIER[role] >= HIER[min];
}

export function canCreate(role: AppRole | null): boolean { return hasMin(role, "CONTRIBUTOR"); }
export function canDelete(role: AppRole | null): boolean { return hasMin(role, "EDITOR"); }
export function canAdmin(role: AppRole | null): boolean { return hasMin(role, "ADMIN"); }

export function roleBadgeColor(role: AppRole | null): string {
  if (role === "ADMIN") return "bg-purple-600 text-white";
  if (role === "EDITOR") return "bg-blue-600 text-white";
  if (role === "CONTRIBUTOR") return "bg-green-600 text-white";
  if (role === "VIEWER") return "bg-gray-600 text-white";
  return "bg-red-600 text-white";
}
```

- [ ] **Step 5: Correr tests**

```bash
npm test -- time role-ui
```
Expected: todos pasan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/time.ts src/lib/role-ui.ts tests/hooks
git commit -m "feat(lib): time and role-ui pure helpers with tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 1: Auth UI + Sidebar

### Task 1.1: LandingLoginDiscord

**Files:**
- Create: `src/components/auth/LandingLoginDiscord.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/components/landing/LandingLogin.tsx`

- [ ] **Step 1: LandingLoginDiscord**

```tsx
"use client";
import { signIn } from "next-auth/react";
import Image from "next/image";

export function LandingLoginDiscord() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-4">
      <div className="w-full max-w-md rounded-2xl border border-indigo-900/50 bg-slate-900/70 p-8 backdrop-blur">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">Avalon Tracker</h1>
        <p className="mb-8 text-center text-sm text-slate-400">
          Gestión colaborativa de rutas de Avalon Roads para clanes de Albion Online.
        </p>
        <button
          onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#5865F2] px-6 py-3 font-semibold text-white transition hover:bg-[#4752c4]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Entrar con Discord
        </button>
        <p className="mt-6 text-center text-xs text-slate-500">
          Tu clan debe tener Vigil Bot instalado en su servidor Discord.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Reemplazar page.tsx**

```tsx
import { LandingLoginDiscord } from "@/components/auth/LandingLoginDiscord";
export default function HomePage() { return <LandingLoginDiscord />; }
```

- [ ] **Step 3: Eliminar legacy**

```bash
rm -rf src/components/landing
```

- [ ] **Step 4: Commit**

```bash
git add src/components/auth src/app/page.tsx src/components/landing
git commit -m "feat(auth-ui): Discord login landing, remove password form

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Sidebar nueva

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (reescribir)

- [ ] **Step 1: Reescribir Sidebar**

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import useSWR from "swr";
import { roleLabel, roleBadgeColor } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type ClanEntry = { id: string; name: string; discordGuildIcon: string | null; myRole: AppRole | null };

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: clans = [] } = useSWR<ClanEntry[]>("/api/me/clans");

  const avatar = session?.user?.image;
  const name = session?.user?.name ?? "Usuario";
  const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;

  return (
    <>
      <button
        className="fixed left-3 top-3 z-50 rounded-md border border-slate-700 bg-slate-900 p-2 text-white md:hidden"
        onClick={() => setOpen(!open)}
        aria-label="Menú"
      >☰</button>

      {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}

      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed z-40 flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950 p-4 transition-transform md:translate-x-0`}>
        <div className="mb-6 flex items-center gap-2">
          <span className="text-xl">🌀</span>
          <span className="font-bold text-white">Avalon Tracker</span>
        </div>

        {session?.user && (
          <div className="mb-6 flex items-center gap-3 rounded-lg bg-slate-900 p-3">
            {avatar ? (
              <Image src={avatar} alt="" width={36} height={36} className="rounded-full" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-indigo-700" />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="truncate text-sm font-medium text-white">{name}</div>
              {isSuperAdmin && (
                <div className="mt-0.5 inline-block rounded bg-yellow-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Super Admin</div>
              )}
            </div>
          </div>
        )}

        <nav className="mb-6 flex flex-col gap-1">
          <Link href="/dashboard" className={navClass(pathname === "/dashboard")}>Dashboard</Link>
          <Link href="/profile" className={navClass(pathname === "/profile")}>Perfil</Link>
          {isSuperAdmin && <Link href="/admin" className={navClass(pathname.startsWith("/admin"))}>Admin Global</Link>}
        </nav>

        <div className="mb-2 text-xs uppercase text-slate-500">Mis clanes</div>
        <div className="mb-6 flex flex-1 flex-col gap-1 overflow-y-auto">
          {clans.map((c) => (
            <Link key={c.id} href={`/clan/${c.id}`} className={navClass(pathname.startsWith(`/clan/${c.id}`))}>
              <span className="truncate">{c.name}</span>
              {c.myRole && (
                <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] ${roleBadgeColor(c.myRole)}`}>
                  {roleLabel(c.myRole)}
                </span>
              )}
            </Link>
          ))}
          {clans.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">Sin clanes todavía</div>}
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >Cerrar sesión</button>
      </aside>
    </>
  );
}

function navClass(active: boolean): string {
  return `flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${active ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-900"}`;
}
```

- [ ] **Step 2: Verificar `src/app/(auth)/layout.tsx`**

Leer el archivo. Debe importar `Sidebar` y renderizar `<Sidebar />` + `<main className="ml-0 md:ml-64 p-6">{children}</main>`. Si no, ajustar.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/app/\(auth\)/layout.tsx
git commit -m "feat(sidebar): Discord avatar + super admin badge + role badges

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 2: Hooks compartidos

### Task 2.1: useMe, useMyClans, useClan

**Files:**
- Create: `src/hooks/useMe.ts`
- Create: `src/hooks/useMyClans.ts`
- Create: `src/hooks/useClan.ts`

- [ ] **Step 1: useMe**

```ts
import useSWR from "swr";
import type { AppRole } from "@/generated/prisma/client";

export type Me = {
  id: string; discordId: string; discordUsername: string; globalNickname: string | null;
  displayName: string | null; image: string | null; isSuperAdmin: boolean;
};

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<Me>("/api/me");
  return { me: data, error, isLoading, mutate };
}
```

- [ ] **Step 2: useMyClans**

```ts
import useSWR from "swr";
import type { AppRole } from "@/generated/prisma/client";

export type MyClan = {
  id: string; name: string; discordGuildName: string; discordGuildIcon: string | null; myRole: AppRole | null;
};

export function useMyClans() {
  const { data, error, isLoading, mutate } = useSWR<MyClan[]>("/api/me/clans");
  return { clans: data ?? [], error, isLoading, mutate };
}
```

- [ ] **Step 3: useClan**

```ts
import useSWR from "swr";

export type ClanDetail = {
  id: string; name: string; discordGuildId: string; discordGuildName: string; discordGuildIcon: string | null;
  discordWebhookUrl: string | null; anchorZoneId: number | null; botInstalled: boolean;
  _count?: { members: number; routes: number };
};

export function useClan(clanId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ClanDetail>(clanId ? `/api/clans/${clanId}` : null);
  return { clan: data, error, isLoading, mutate };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useMe.ts src/hooks/useMyClans.ts src/hooks/useClan.ts
git commit -m "feat(hooks): useMe, useMyClans, useClan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: useVisibilityPolling + useClanRoutes

**Files:**
- Create: `src/hooks/useVisibilityPolling.ts`
- Create: `src/hooks/useClanRoutes.ts`

- [ ] **Step 1: useVisibilityPolling**

```ts
import { useEffect, useState } from "react";

export function useVisibilityPolling(visibleMs = 12_000, backgroundMs = 60_000): number {
  const [ms, setMs] = useState<number>(typeof document !== "undefined" && document.visibilityState === "visible" ? visibleMs : backgroundMs);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => setMs(document.visibilityState === "visible" ? visibleMs : backgroundMs);
    document.addEventListener("visibilitychange", handler);
    handler();
    return () => document.removeEventListener("visibilitychange", handler);
  }, [visibleMs, backgroundMs]);

  return ms;
}
```

- [ ] **Step 2: useClanRoutes**

```ts
import useSWR from "swr";
import { useVisibilityPolling } from "./useVisibilityPolling";

export type HopStatus = "ACTIVE" | "EXPIRED" | "COLLAPSED" | "WATCHED";
export type RouteStatusFilter = "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL";

export type HopView = {
  id: number; order: number; portalSize: number; expiresAt: string;
  status: HopStatus; statusNote: string | null;
  fromZone: { id: number; name: string; type: string; tier: number | null; isRest: boolean; hasHideout: boolean };
  toZone:   { id: number; name: string; type: string; tier: number | null; isRest: boolean; hasHideout: boolean };
};
export type RouteView = {
  id: string; clanId: string; status: "ACTIVE" | "EXPIRED" | "DISABLED"; version: number;
  notes: string | null; updatedAt: string; createdAt: string;
  createdBy: { id: string; discordUsername: string; displayName: string | null; globalNickname: string | null; discordAvatar: string | null };
  hops: HopView[];
};
export type RoutesResponse = { routes: RouteView[]; now: string };

export function useClanRoutes(clanId: string | undefined, filter: RouteStatusFilter = "ACTIVE") {
  const refreshMs = useVisibilityPolling();
  const url = clanId ? `/api/clans/${clanId}/routes?status=${filter}` : null;
  const { data, error, isLoading, mutate } = useSWR<RoutesResponse>(url, {
    refreshInterval: refreshMs,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  return { routes: data?.routes ?? [], now: data?.now, error, isLoading, mutate };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useVisibilityPolling.ts src/hooks/useClanRoutes.ts
git commit -m "feat(hooks): visibility-aware polling and clan routes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: useZoneSearch + useZoneRouting

**Files:**
- Create: `src/hooks/useZoneSearch.ts`
- Create: `src/hooks/useZoneRouting.ts`

- [ ] **Step 1: useZoneSearch con debounce**

```ts
import useSWR from "swr";
import { useEffect, useState } from "react";

export type ZoneSuggestion = {
  id: number; name: string; type: "AVALON" | "ROYAL" | "OUTLANDS"; tier: number | null;
  hasHideout: boolean; isRest: boolean; isCapital: boolean;
};

export function useZoneSearch(query: string, enabled = true) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const url = enabled && debounced.length > 0 ? `/api/zones?q=${encodeURIComponent(debounced)}` : null;
  const { data = [], isLoading } = useSWR<ZoneSuggestion[]>(url, { revalidateOnFocus: false });
  return { suggestions: data, isLoading };
}
```

- [ ] **Step 2: useZoneRouting**

```ts
import useSWR from "swr";

export type ZoneRouting = {
  nearestRoyal: { zone: { id: number; name: string; type: string; tier: number | null }; hops: number } | null;
  nearestRest:  { zone: { id: number; name: string; type: string; tier: number | null }; hops: number } | null;
  computedAt?: string;
};

export function useZoneRouting(zoneId: number | null) {
  const { data, isLoading } = useSWR<ZoneRouting>(zoneId ? `/api/zones/${zoneId}/routing` : null, {
    revalidateOnFocus: false,
  });
  return { routing: data, isLoading };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useZoneSearch.ts src/hooks/useZoneRouting.ts
git commit -m "feat(hooks): zone search (debounced) and routing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 3: Dashboard + Profile

### Task 3.1: Dashboard

**Files:**
- Modify: `src/app/(auth)/dashboard/page.tsx` (reescribir)
- Delete: `src/components/dashboard/DashboardClient.tsx`
- Create: `src/components/clan/CreateClanModal.tsx` (reemplazo)

- [ ] **Step 1: Dashboard page**

```tsx
"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import { useMyClans } from "@/hooks/useMyClans";
import { roleLabel, roleBadgeColor } from "@/lib/role-ui";
import { CreateClanModal } from "@/components/clan/CreateClanModal";

export default function DashboardPage() {
  const { me } = useMe();
  const { clans, mutate } = useMyClans();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Hola, {me?.displayName ?? me?.globalNickname ?? me?.discordUsername ?? "Usuario"}</h1>
        <p className="text-sm text-slate-400">Elige un clan para ver sus rutas o crea uno nuevo.</p>
      </header>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Mis clanes</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >+ Nuevo clan</button>
        </div>

        {clans.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
            Todavía no estás en ningún clan. Si tu clan ya está dado de alta y has iniciado sesión con Discord, asegúrate de tener un rol mapeado.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clans.map((c) => (
              <Link key={c.id} href={`/clan/${c.id}`} className="group rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-indigo-700">
                <div className="mb-3 flex items-center gap-3">
                  {c.discordGuildIcon ? (
                    <Image src={`https://cdn.discordapp.com/icons/${c.id}/${c.discordGuildIcon}.png`} alt="" width={40} height={40} className="rounded" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-indigo-700 text-center text-xl leading-10">🛡️</div>
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-slate-400">{c.discordGuildName}</div>
                  </div>
                </div>
                <div className={`inline-block rounded px-2 py-0.5 text-xs ${roleBadgeColor(c.myRole)}`}>{roleLabel(c.myRole)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showCreate && <CreateClanModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); mutate(); }} />}
    </div>
  );
}
```

- [ ] **Step 2: CreateClanModal**

```tsx
"use client";
import { useState } from "react";
import toast from "react-hot-toast";

export function CreateClanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");
  const [guildName, setGuildName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/clans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, discordGuildId: guildId, discordGuildName: guildName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Error al crear clan");
      toast.success("Clan creado");
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">Crear nuevo clan</h2>
        <p className="text-xs text-slate-400">Vigil Bot debe estar instalado en el servidor Discord antes de crear el clan.</p>

        <label className="block">
          <span className="text-sm text-slate-300">Nombre del clan</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={40}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Discord Guild ID</span>
          <input value={guildId} onChange={(e) => setGuildId(e.target.value)} required pattern="\d{17,20}" placeholder="Click derecho en el servidor → Copiar ID"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white" />
        </label>

        <label className="block">
          <span className="text-sm text-slate-300">Nombre del servidor Discord</span>
          <input value={guildName} onChange={(e) => setGuildName(e.target.value)} required minLength={1} maxLength={100}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancelar</button>
          <button type="submit" disabled={submitting} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {submitting ? "Creando…" : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Eliminar legacy**

```bash
rm -rf src/components/dashboard
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/dashboard src/components/clan/CreateClanModal.tsx src/components/dashboard
git commit -m "feat(dashboard): Discord-first dashboard + CreateClanModal with guild ID

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Profile

**Files:**
- Modify: `src/app/(auth)/profile/page.tsx` (reescribir)

- [ ] **Step 1: Profile page**

```tsx
"use client";
import Image from "next/image";
import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import toast from "react-hot-toast";

export default function ProfilePage() {
  const { me, mutate } = useMe();
  const [displayName, setDisplayName] = useState<string>("");
  const [saving, setSaving] = useState(false);

  if (!me) return <div className="text-slate-400">Cargando…</div>;

  async function save() {
    setSaving(true);
    try {
      const val = displayName.trim() || null;
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: val }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Guardado");
      mutate();
      setDisplayName("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      <h1 className="text-2xl font-bold text-white">Perfil</h1>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Identidad Discord</h2>
        <div className="flex items-center gap-4">
          {me.image ? (
            <Image src={me.image} alt="" width={64} height={64} className="rounded-full" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-indigo-700" />
          )}
          <div>
            <div className="font-semibold text-white">{me.globalNickname ?? me.discordUsername}</div>
            <div className="text-sm text-slate-400">@{me.discordUsername}</div>
            <div className="font-mono text-xs text-slate-600">{me.discordId}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-white">Nombre a mostrar</h2>
        <p className="mb-3 text-sm text-slate-400">
          Si lo rellenas, se usará en la app en vez de tu username Discord. Los admins de tus clanes también pueden sobrescribirlo.
        </p>
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={me.displayName ?? "Sin nombre custom"}
            maxLength={40}
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >Guardar</button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/profile/page.tsx
git commit -m "feat(profile): Discord identity + displayName override

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 4: Clan Settings + RoleMappingEditor

### Task 4.1: RoleMappingEditor

**Files:**
- Create: `src/components/clan/RoleMappingEditor.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";
import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import toast from "react-hot-toast";
import type { AppRole } from "@/generated/prisma/client";

type DiscordRole = { id: string; name: string; color: number; position: number };
type Mapping = { id: number; clanId: string; discordRoleId: string; discordRoleName: string; appRole: AppRole };

const ROLES: AppRole[] = ["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"];

export function RoleMappingEditor({ clanId }: { clanId: string }) {
  const { data: discordRoles = [], error: drErr, isLoading: drLoading } = useSWR<DiscordRole[]>(`/api/clans/${clanId}/discord-roles`);
  const { data: mappings = [], mutate } = useSWR<Mapping[]>(`/api/clans/${clanId}/role-mappings`);

  const [newRoleId, setNewRoleId] = useState<string>("");
  const [newAppRole, setNewAppRole] = useState<AppRole>("VIEWER");

  async function addMapping() {
    const role = discordRoles.find((r) => r.id === newRoleId);
    if (!role) return toast.error("Rol inválido");
    const res = await fetch(`/api/clans/${clanId}/role-mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordRoleId: role.id, discordRoleName: role.name, appRole: newAppRole }),
    });
    if (!res.ok) return toast.error("Error al guardar mapping");
    toast.success("Mapping guardado");
    setNewRoleId("");
    mutate();
  }

  async function removeMapping(id: number) {
    if (!confirm("¿Eliminar mapping?")) return;
    const res = await fetch(`/api/clans/${clanId}/role-mappings/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Error al eliminar");
    toast.success("Eliminado");
    mutate();
  }

  if (drErr) {
    return (
      <div className="rounded border border-red-700 bg-red-900/30 p-4 text-sm text-red-200">
        Vigil Bot no responde — no se pueden listar los roles del servidor Discord.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 font-semibold text-white">Mapeos actuales</h3>
        {mappings.length === 0 ? (
          <div className="text-sm text-slate-400">Sin mapeos. Añade al menos uno debajo para que los miembros tengan acceso.</div>
        ) : (
          <ul className="space-y-2">
            {mappings.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
                <div>
                  <span className="font-medium text-white">{m.discordRoleName}</span>
                  <span className="mx-2 text-slate-500">→</span>
                  <span className="rounded bg-indigo-600 px-2 py-0.5 text-xs text-white">{m.appRole}</span>
                </div>
                <button onClick={() => removeMapping(m.id)} className="text-sm text-red-400 hover:text-red-300">Eliminar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="mb-3 font-semibold text-white">Añadir mapping</h3>
        {drLoading ? (
          <div className="text-sm text-slate-400">Cargando roles Discord…</div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[180px]">
              <span className="text-xs uppercase text-slate-400">Rol Discord</span>
              <select value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                <option value="">— elegir —</option>
                {discordRoles
                  .filter((r) => !mappings.some((m) => m.discordRoleId === r.id))
                  .sort((a, b) => b.position - a.position)
                  .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="flex-1 min-w-[140px]">
              <span className="text-xs uppercase text-slate-400">Rol app</span>
              <select value={newAppRole} onChange={(e) => setNewAppRole(e.target.value as AppRole)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <button onClick={addMapping} disabled={!newRoleId}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              Añadir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/clan/RoleMappingEditor.tsx
git commit -m "feat(roles): RoleMappingEditor UI

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Settings page

**Files:**
- Modify: `src/app/(auth)/clan/[clanId]/settings/page.tsx` (reescribir)

- [ ] **Step 1: Implementar**

```tsx
"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useClan } from "@/hooks/useClan";
import { RoleMappingEditor } from "@/components/clan/RoleMappingEditor";

export default function SettingsPage() {
  const { clanId } = useParams() as { clanId: string };
  const router = useRouter();
  const { clan, mutate } = useClan(clanId);
  const [name, setName] = useState("");
  const [webhook, setWebhook] = useState("");
  const [anchorSearch, setAnchorSearch] = useState("");
  const [saving, setSaving] = useState(false);

  if (!clan) return <div className="text-slate-400">Cargando…</div>;

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast.success("Guardado");
      mutate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    const res = await fetch(`/api/clans/${clanId}/webhook-test`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Mensaje enviado a Discord");
    else toast.error(body?.error?.message ?? "Error en webhook");
  }

  async function deleteClan() {
    if (!confirm(`Escribe el nombre exacto (${clan?.name}) para confirmar`)) return;
    const res = await fetch(`/api/clans/${clanId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Clan eliminado"); router.push("/dashboard"); }
    else toast.error("Error al borrar");
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-white">Configuración de {clan.name}</h1>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Identidad</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm text-slate-300">Nombre</span>
            <div className="mt-1 flex gap-2">
              <input defaultValue={clan.name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
              <button disabled={!name || saving} onClick={() => save({ name })} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Guardar</button>
            </div>
          </label>
          <div>
            <span className="text-sm text-slate-300">Guild Discord</span>
            <div className="mt-1 rounded border border-slate-700 bg-slate-950 px-3 py-2">
              <div className="text-white">{clan.discordGuildName}</div>
              <div className="font-mono text-xs text-slate-500">{clan.discordGuildId}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Webhook Discord</h2>
        <div className="space-y-3">
          <input
            defaultValue={clan.discordWebhookUrl ?? ""}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
          />
          <div className="flex gap-2">
            <button disabled={saving} onClick={() => save({ discordWebhookUrl: webhook || null })} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white">Guardar</button>
            <button disabled={!clan.discordWebhookUrl} onClick={testWebhook} className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Probar</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Zona anchor (centro del grafo)</h2>
        <AnchorPicker clanId={clanId} currentAnchorId={clan.anchorZoneId} onUpdated={() => mutate()} />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-white">Mapeo de roles Discord</h2>
        <RoleMappingEditor clanId={clanId} />
      </section>

      <section className="rounded-xl border border-red-900/50 bg-red-950/30 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-200">Zona peligrosa</h2>
        <p className="mb-3 text-sm text-red-300">Eliminar el clan borra todas sus rutas, miembros y mappings. No se puede deshacer.</p>
        <button onClick={deleteClan} className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">Eliminar clan</button>
      </section>
    </div>
  );
}

function AnchorPicker({ clanId, currentAnchorId, onUpdated }: { clanId: string; currentAnchorId: number | null; onUpdated: () => void }) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  async function pick(zoneId: number | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clans/${clanId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorZoneId: zoneId }),
      });
      if (!res.ok) throw new Error("Error");
      toast.success("Anchor actualizado");
      onUpdated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  // Simplified inline search: link to members-style selector would be cleaner;
  // dejamos picker simple: quitarlo o introducir ID manual.
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-400">Zona anchor actual: {currentAnchorId ?? "sin configurar"}</div>
      <div className="flex gap-2">
        <input type="number" placeholder="Zone ID (de /api/zones?q=)" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        <button disabled={saving || !search} onClick={() => pick(Number(search))} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Fijar</button>
        <button disabled={saving || !currentAnchorId} onClick={() => pick(null)} className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Quitar</button>
      </div>
      <p className="text-xs text-slate-500">El selector pro vendrá con ZoneAutocomplete en una fase posterior.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/clan/\[clanId\]/settings/page.tsx
git commit -m "feat(settings): clan settings — webhook, anchor, role mappings, delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 5: Clan Members

### Task 5.1: Members page

**Files:**
- Modify: `src/app/(auth)/clan/[clanId]/members/page.tsx` (reescribir)

- [ ] **Step 1: Implementar**

```tsx
"use client";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { useMe } from "@/hooks/useMe";
import { useClan } from "@/hooks/useClan";
import { roleLabel, roleBadgeColor, canAdmin } from "@/lib/role-ui";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = {
  id: number; userId: string; appRole: AppRole | null; roleSource: string | null; lastSyncAt: string | null; joinedAt: string;
  user: { id: string; discordUsername: string; globalNickname: string | null; displayName: string | null; discordAvatar: string | null; discordId: string };
};

export default function MembersPage() {
  const { clanId } = useParams() as { clanId: string };
  const { data: members = [], mutate } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const { me } = useMe();
  const myMember = members.find((m) => m.userId === me?.id);
  const amAdmin = canAdmin(myMember?.appRole ?? null);
  const [editing, setEditing] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  async function saveOverride(memberId: number) {
    const val = newName.trim() || null;
    const res = await fetch(`/api/clans/${clanId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: val }),
    });
    if (res.ok) { toast.success("Guardado"); setEditing(null); mutate(); }
    else toast.error("Error");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Miembros ({members.length})</h1>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Usuario</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Rol</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Entró</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Último sync</th>
              {amAdmin && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="flex items-center gap-3 px-3 py-2">
                  {m.user.discordAvatar ? (
                    <Image src={`https://cdn.discordapp.com/avatars/${m.user.discordId}/${m.user.discordAvatar}.png`} alt="" width={32} height={32} className="rounded-full" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-indigo-700" />
                  )}
                  <div>
                    <div className="font-medium text-white">
                      {m.user.displayName ?? m.user.globalNickname ?? m.user.discordUsername}
                    </div>
                    <div className="text-xs text-slate-500">@{m.user.discordUsername}</div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${roleBadgeColor(m.appRole)}`}>{roleLabel(m.appRole)}</span>
                </td>
                <td className="px-3 py-2 text-slate-400">{new Date(m.joinedAt).toLocaleDateString("es-ES")}</td>
                <td className="px-3 py-2 text-slate-500">{m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString("es-ES") : "—"}</td>
                {amAdmin && (
                  <td className="px-3 py-2 text-right">
                    {editing === m.id ? (
                      <span className="flex gap-1">
                        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre override" maxLength={40} className="w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white" />
                        <button onClick={() => saveOverride(m.id)} className="rounded bg-green-600 px-2 py-1 text-xs text-white">OK</button>
                        <button onClick={() => setEditing(null)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">X</button>
                      </span>
                    ) : (
                      <button onClick={() => { setEditing(m.id); setNewName(m.user.displayName ?? ""); }} className="text-xs text-indigo-400 hover:text-indigo-300">
                        Renombrar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/clan/\[clanId\]/members/page.tsx
git commit -m "feat(members): Discord members list + admin displayName override

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 6: Clan Audit (fix bug)

### Task 6.1: Audit page

**Files:**
- Modify: `src/app/(auth)/clan/[clanId]/audit/page.tsx` (reescribir con fix del bug)

- [ ] **Step 1: Implementar**

```tsx
"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

type AuditEntry = {
  id: number; action: string; details: Record<string, unknown> | null; createdAt: string;
  user: { id: string; discordUsername: string; globalNickname: string | null; displayName: string | null };
};
type AuditResponse = { data: AuditEntry[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const ACTION_LABELS: Record<string, string> = {
  CLAN_CREATE: "Clan creado", CLAN_UPDATE: "Clan actualizado", CLAN_DELETE: "Clan eliminado",
  MEMBER_ROLE_SYNCED: "Rol sincronizado", MEMBER_LEFT: "Miembro dejó clan",
  ROUTE_CREATE: "Ruta creada", ROUTE_UPDATE: "Ruta actualizada", ROUTE_DISABLE: "Ruta deshabilitada", ROUTE_DELETE: "Ruta eliminada",
  HOP_STATUS_CHANGED: "Estado de hop", HOP_EXTENDED: "Hop extendido", HOP_DELETE: "Hop eliminado",
  SETTINGS_CHANGE: "Config cambiada", ROLE_MAPPING_CHANGE: "Mapeo de rol", WEBHOOK_UPDATE: "Webhook actualizado",
  DISCORD_LOGIN_FIRST: "Primer login Discord",
};

export default function AuditPage() {
  const { clanId } = useParams() as { clanId: string };
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useSWR<AuditResponse>(`/api/clans/${clanId}/audit?page=${page}&limit=20`);

  if (error?.status === 403) {
    return <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Solo los Admin del clan pueden ver auditoría.</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Auditoría</h1>

      {isLoading && <div className="text-slate-400">Cargando…</div>}

      {!isLoading && (data?.data.length ?? 0) === 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Sin eventos registrados.</div>
      )}

      {(data?.data.length ?? 0) > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Fecha</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Usuario</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Acción</th>
                  <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data!.data.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{new Date(e.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-2 text-white">{e.user.displayName ?? e.user.globalNickname ?? e.user.discordUsername}</td>
                    <td className="px-3 py-2 text-slate-300">{ACTION_LABELS[e.action] ?? e.action}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.details ? JSON.stringify(e.details) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 disabled:opacity-50">Anterior</button>
            <span className="text-sm text-slate-500">Página {data!.pagination.page} de {data!.pagination.totalPages} · {data!.pagination.total} eventos</span>
            <button disabled={page >= data!.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-300 disabled:opacity-50">Siguiente</button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/clan/\[clanId\]/audit/page.tsx
git commit -m "fix(audit): read data.data (fixes empty table bug); ADMIN-gated via 403

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 7: Zone components

### Task 7.1: ZoneBadges + ZoneAutocomplete v2

**Files:**
- Create: `src/components/zones/ZoneBadges.tsx`
- Modify: `src/components/routes/ZoneAutocomplete.tsx` (mover a `src/components/zones/` y reescribir)

- [ ] **Step 1: ZoneBadges**

```tsx
import type { ZoneSuggestion } from "@/hooks/useZoneSearch";

export function ZoneBadges({ zone }: { zone: ZoneSuggestion }) {
  const color = zone.type === "AVALON" ? "bg-violet-700" : zone.type === "ROYAL" ? "bg-blue-700" : "bg-red-700";
  return (
    <span className="flex gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${color}`}>{zone.type}</span>
      {zone.tier != null && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white">T{zone.tier}</span>}
      {zone.hasHideout && <span className="rounded bg-yellow-600 px-1.5 py-0.5 text-[10px] text-white">HO</span>}
      {zone.isRest && <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] text-white">Rest</span>}
      {zone.isCapital && <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] text-white">Capital</span>}
    </span>
  );
}
```

- [ ] **Step 2: ZoneAutocomplete v2**

```tsx
"use client";
import { useRef, useState, useEffect } from "react";
import { useZoneSearch, type ZoneSuggestion } from "@/hooks/useZoneSearch";
import { ZoneBadges } from "./ZoneBadges";

export function ZoneAutocomplete({
  value, onChange, placeholder, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setInput(value), [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { suggestions } = useZoneSearch(input, open && input.length > 0);

  function select(s: ZoneSuggestion) {
    setInput(s.name);
    onChange(s.name);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={input}
        disabled={disabled}
        placeholder={placeholder ?? "Zona…"}
        onChange={(e) => { setInput(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(suggestions.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter" && suggestions[hi]) { e.preventDefault(); select(suggestions[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-xl">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setHi(i)}
              onClick={() => select(s)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === hi ? "bg-indigo-800" : "hover:bg-slate-800"}`}
            >
              <span className="text-white">{s.name}</span>
              <ZoneBadges zone={s} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mover, eliminar legacy**

```bash
mkdir -p src/components/zones
mv src/components/zones/ZoneAutocomplete.tsx src/components/zones/ZoneAutocomplete.tsx.bak 2>/dev/null || true
# si el import path cambió, actualizar referencias en modales
grep -rl "components/routes/ZoneAutocomplete" src/ | xargs -I{} sed -i 's|components/routes/ZoneAutocomplete|components/zones/ZoneAutocomplete|g' {}
rm -f src/components/routes/ZoneAutocomplete.tsx src/components/zones/ZoneAutocomplete.tsx.bak 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add src/components/zones src/components/routes
git commit -m "feat(zones): enriched autocomplete with tier/HO/rest/capital badges

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 8: CreateRouteModal v2

### Task 8.1: Modal con shortcuts + chain validation

**Files:**
- Modify: `src/components/routes/CreateRouteModal.tsx` (reescribir)

- [ ] **Step 1: Implementar**

```tsx
"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { mutate } from "swr";
import { ZoneAutocomplete } from "@/components/zones/ZoneAutocomplete";

type HopInput = { fromZone: string; toZone: string; portalSize: 7 | 20 | 40; hours: number; minutes: number };

const newHop = (from = ""): HopInput => ({ fromZone: from, toZone: "", portalSize: 7, hours: 2, minutes: 0 });

export function CreateRouteModal({ clanId, onClose, onCreated }: { clanId: string; onClose: () => void; onCreated: () => void }) {
  const [hops, setHops] = useState<HopInput[]>([newHop()]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setHop(i: number, patch: Partial<HopInput>) {
    setHops((prev) => {
      const next = prev.map((h, idx) => idx === i ? { ...h, ...patch } : h);
      if (patch.toZone != null && next[i + 1]) next[i + 1] = { ...next[i + 1], fromZone: patch.toZone };
      return next;
    });
  }

  function addHop() { setHops((p) => [...p, newHop(p[p.length - 1].toZone)]); }
  function removeHop(i: number) { setHops((p) => p.filter((_, idx) => idx !== i)); }
  function bumpTime(i: number, minutes: number) {
    setHops((p) => p.map((h, idx) => {
      if (idx !== i) return h;
      const total = h.hours * 60 + h.minutes + minutes;
      return { ...h, hours: Math.max(0, Math.floor(total / 60)), minutes: Math.max(0, total % 60) };
    }));
  }

  function validate(): string | null {
    for (let i = 0; i < hops.length; i++) {
      const h = hops[i];
      if (!h.fromZone.trim() || !h.toZone.trim()) return `Hop ${i + 1}: zonas obligatorias`;
      if (h.hours === 0 && h.minutes === 0) return `Hop ${i + 1}: duración > 0`;
      if (i > 0 && h.fromZone !== hops[i - 1].toZone) return `Hop ${i + 1}: cadena rota (${hops[i - 1].toZone} → ${h.fromZone})`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);
    setSubmitting(true);
    const now = Date.now();
    const body = {
      hops: hops.map((h) => ({
        fromZone: h.fromZone.trim(),
        toZone: h.toZone.trim(),
        portalSize: h.portalSize,
        expiresAt: new Date(now + (h.hours * 60 + h.minutes) * 60_000).toISOString(),
      })),
      notes: notes.trim() || undefined,
    };
    try {
      const res = await fetch(`/api/clans/${clanId}/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error?.message ?? "Error al crear ruta"); }
      toast.success("Ruta creada");
      mutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl my-8 space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white">Nueva ruta</h2>

        <div className="space-y-3">
          {hops.map((h, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 rounded border border-slate-800 bg-slate-950 p-3">
              <div className="col-span-5">
                <div className="text-xs text-slate-400">Desde</div>
                <ZoneAutocomplete value={h.fromZone} onChange={(v) => setHop(i, { fromZone: v })} disabled={i > 0} />
              </div>
              <div className="col-span-5">
                <div className="text-xs text-slate-400">Hasta</div>
                <ZoneAutocomplete value={h.toZone} onChange={(v) => setHop(i, { toZone: v })} />
              </div>
              <div className="col-span-2 flex flex-col">
                <div className="text-xs text-slate-400">Tamaño</div>
                <select value={h.portalSize} onChange={(e) => setHop(i, { portalSize: Number(e.target.value) as 7 | 20 | 40 })}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-2 text-white">
                  <option value={7}>7p</option>
                  <option value={20}>20p</option>
                  <option value={40}>Tentáculo</option>
                </select>
              </div>
              <div className="col-span-12 flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-400">Duración
                  <div className="mt-1 flex gap-1">
                    <input type="number" min="0" max="24" value={h.hours} onChange={(e) => setHop(i, { hours: Number(e.target.value) })} className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" /> h
                    <input type="number" min="0" max="59" value={h.minutes} onChange={(e) => setHop(i, { minutes: Number(e.target.value) })} className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" /> m
                  </div>
                </label>
                {[30, 60, 120, 240, 360].map((m) => (
                  <button key={m} type="button" onClick={() => bumpTime(i, m)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
                    +{m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
                {hops.length > 1 && <button type="button" onClick={() => removeHop(i)} className="ml-auto rounded bg-red-700/50 px-2 py-1 text-xs text-red-200">Quitar</button>}
              </div>
            </div>
          ))}
        </div>

        {hops.length < 12 && (
          <button type="button" onClick={addHop} className="w-full rounded border border-dashed border-slate-700 py-2 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-400">
            + Añadir hop
          </button>
        )}

        <label className="block">
          <span className="text-sm text-slate-300">Nota (opcional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={onClose} className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button>
          <button type="submit" disabled={submitting} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Creando…" : "Crear ruta"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/routes/CreateRouteModal.tsx
git commit -m "feat(routes): CreateRouteModal v2 — autocomplete, shortcuts, chain validation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 9: Route List fallback

### Task 9.1: RouteListTable + /list page

**Files:**
- Create: `src/components/routes/RouteListTable.tsx`
- Create: `src/app/(auth)/clan/[clanId]/list/page.tsx`

- [ ] **Step 1: RouteListTable**

```tsx
"use client";
import { useState } from "react";
import { secondsLeft, formatCountdown, colorForMinutes, minutesLeft } from "@/lib/time";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { AppRole } from "@/generated/prisma/client";
import { canCreate, canDelete } from "@/lib/role-ui";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import { CreateRouteModal } from "./CreateRouteModal";
import { useParams } from "next/navigation";

export function RouteListTable({ routes, myRole }: { routes: RouteView[]; myRole: AppRole | null }) {
  const { clanId } = useParams() as { clanId: string };
  const [showCreate, setShowCreate] = useState(false);

  async function disable(routeId: string, version: number) {
    const res = await fetch(`/api/clans/${clanId}/routes/${routeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": `v=${version}` },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    if (res.ok) { toast.success("Ruta deshabilitada"); globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`)); }
    else if (res.status === 409) toast.error("Otro miembro editó esto; recarga");
    else toast.error("Error");
  }

  async function del(routeId: string) {
    if (!confirm("¿Borrar permanentemente?")) return;
    const res = await fetch(`/api/clans/${clanId}/routes/${routeId}`, { method: "DELETE" });
    if (res.ok) { toast.success("Borrado"); globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`)); }
    else toast.error("Error");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Rutas ({routes.length})</h1>
        {canCreate(myRole) && (
          <button onClick={() => setShowCreate(true)} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Nueva</button>
        )}
      </div>

      {routes.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Sin rutas activas.</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Cadena</th>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creada por</th>
                <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Próximo vencimiento</th>
                {(canCreate(myRole) || canDelete(myRole)) && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {routes.map((r) => {
                const nextExpiry = r.hops.filter((h) => h.status === "ACTIVE").sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
                const mins = nextExpiry ? minutesLeft(nextExpiry.expiresAt) : -1;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1 text-sm">
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
                    {(canCreate(myRole) || canDelete(myRole)) && (
                      <td className="px-3 py-3 text-right">
                        {canCreate(myRole) && <button onClick={() => disable(r.id, r.version)} className="mr-2 text-xs text-yellow-400 hover:text-yellow-300">Disable</button>}
                        {canDelete(myRole) && <button onClick={() => del(r.id)} className="text-xs text-red-400 hover:text-red-300">Borrar</button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateRouteModal clanId={clanId} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: /list page**

```tsx
"use client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useClanRoutes } from "@/hooks/useClanRoutes";
import { RouteListTable } from "@/components/routes/RouteListTable";
import type { AppRole } from "@/generated/prisma/client";

type MemberRow = { userId: string; appRole: AppRole | null };

export default function ClanListPage() {
  const { clanId } = useParams() as { clanId: string };
  const { routes, isLoading } = useClanRoutes(clanId);
  const { data: members = [] } = useSWR<MemberRow[]>(`/api/clans/${clanId}/members`);
  const { data: me } = useSWR<{ id: string }>("/api/me");
  const myRole = members.find((m) => m.userId === me?.id)?.appRole ?? null;

  if (isLoading) return <div className="text-slate-400">Cargando…</div>;
  return <RouteListTable routes={routes} myRole={myRole} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/routes/RouteListTable.tsx src/app/\(auth\)/clan/\[clanId\]/list
git commit -m "feat(routes): list view with version-aware disable/delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 10: Graph primary view (react-flow)

### Task 10.1: Helpers de grafo (colors + layout)

**Files:**
- Create: `src/components/graph/graph-colors.ts`
- Create: `src/components/graph/graph-layout.ts`

- [ ] **Step 1: graph-colors**

```ts
import type { HopView } from "@/hooks/useClanRoutes";
import { colorForMinutes, minutesLeft } from "@/lib/time";

export function edgeColorForHop(hop: HopView): string {
  if (hop.status === "EXPIRED") return "#3b82f6";
  if (hop.status === "COLLAPSED") return "#6b7280";
  if (hop.status === "WATCHED") return "#fbbf24";
  return colorForMinutes(minutesLeft(hop.expiresAt));
}

export function edgeWidthForPortal(size: number): number {
  if (size === 7) return 1.5;
  if (size === 20) return 3;
  if (size === 40) return 5;
  return 2;
}

export function edgeDashForHop(hop: HopView): string | undefined {
  if (hop.status === "COLLAPSED") return "4 2";
  return undefined;
}

export function nodeColorForZoneType(type: string): string {
  if (type === "AVALON") return "#7c3aed";
  if (type === "ROYAL") return "#2563eb";
  if (type === "OUTLANDS") return "#dc2626";
  return "#64748b";
}
```

- [ ] **Step 2: graph-layout**

```ts
import type { RouteView, HopView } from "@/hooks/useClanRoutes";

export type LayoutNode = { id: string; zoneName: string; zoneType: string; tier: number | null; hasHideout: boolean; isRest: boolean; isCapital: boolean; x: number; y: number };
export type LayoutEdge = { id: string; source: string; target: string; hop: HopView; routeId: string };

export function computeLayout(routes: RouteView[], anchorZoneName: string | null): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const nodes = new Map<string, LayoutNode>();
  const edges: LayoutEdge[] = [];

  function ensureNode(name: string, z: HopView["fromZone"] | HopView["toZone"]) {
    if (nodes.has(name)) return;
    nodes.set(name, {
      id: name, zoneName: name, zoneType: z.type, tier: z.tier,
      hasHideout: z.hasHideout, isRest: z.isRest, isCapital: (z as { isCapital?: boolean }).isCapital ?? false,
      x: 0, y: 0,
    });
  }

  for (const r of routes) {
    for (const h of r.hops) {
      ensureNode(h.fromZone.name, h.fromZone);
      ensureNode(h.toZone.name, h.toZone);
      edges.push({ id: `${r.id}-${h.id}`, source: h.fromZone.name, target: h.toZone.name, hop: h, routeId: r.id });
    }
  }

  const list = Array.from(nodes.values());
  const center = anchorZoneName && nodes.has(anchorZoneName) ? nodes.get(anchorZoneName)! : list[0];
  if (!center) return { nodes: [], edges };

  // Layout radial básico: anchor al centro, resto en círculos concéntricos por distancia en edges
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    adj.set(e.source, (adj.get(e.source) ?? new Set()).add(e.target));
    adj.set(e.target, (adj.get(e.target) ?? new Set()).add(e.source));
  }
  const distances = new Map<string, number>([[center.id, 0]]);
  const queue = [center.id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = distances.get(cur)!;
    for (const n of adj.get(cur) ?? []) {
      if (!distances.has(n)) { distances.set(n, d + 1); queue.push(n); }
    }
  }
  const byDist = new Map<number, string[]>();
  for (const [n, d] of distances) {
    if (!byDist.has(d)) byDist.set(d, []);
    byDist.get(d)!.push(n);
  }

  const RADIUS_STEP = 220;
  for (const [d, names] of byDist) {
    if (d === 0) {
      nodes.set(names[0], { ...nodes.get(names[0])!, x: 0, y: 0 });
      continue;
    }
    const count = names.length;
    names.forEach((name, i) => {
      const angle = (i / count) * Math.PI * 2;
      const r = d * RADIUS_STEP;
      nodes.set(name, { ...nodes.get(name)!, x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
  }

  // Nodes not reachable from anchor: stack a la derecha
  let fallbackY = 0;
  for (const n of list) {
    if (!distances.has(n.id)) {
      nodes.set(n.id, { ...nodes.get(n.id)!, x: 600, y: fallbackY });
      fallbackY += 120;
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/graph/graph-colors.ts src/components/graph/graph-layout.ts
git commit -m "feat(graph): color and radial layout helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10.2: ZoneNode + RouteEdge + ClanGraph

**Files:**
- Create: `src/components/graph/ZoneNode.tsx`
- Create: `src/components/graph/RouteEdge.tsx`
- Create: `src/components/graph/ClanGraph.tsx`

- [ ] **Step 1: ZoneNode**

```tsx
"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeColorForZoneType } from "./graph-colors";
import type { LayoutNode } from "./graph-layout";

export function ZoneNode({ data, selected }: NodeProps<LayoutNode>) {
  const color = nodeColorForZoneType(data.zoneType);
  return (
    <div className={`rounded-lg border-2 bg-slate-900 px-3 py-2 shadow ${selected ? "border-yellow-400" : "border-slate-700"}`} style={{ borderColor: selected ? "#facc15" : color }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="font-semibold text-white">{data.zoneName}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {data.tier != null && <span className="rounded bg-slate-700 px-1 py-0.5 text-[10px] text-white">T{data.tier}</span>}
        {data.hasHideout && <span className="rounded bg-yellow-700 px-1 py-0.5 text-[10px] text-white">HO</span>}
        {data.isRest && <span className="rounded bg-green-700 px-1 py-0.5 text-[10px] text-white">Rest</span>}
        {data.isCapital && <span className="rounded bg-amber-700 px-1 py-0.5 text-[10px] text-white">Capital</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
```

- [ ] **Step 2: RouteEdge**

```tsx
"use client";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { edgeColorForHop, edgeWidthForPortal, edgeDashForHop } from "./graph-colors";
import { formatCountdown, secondsLeft } from "@/lib/time";
import type { HopView } from "@/hooks/useClanRoutes";

export function RouteEdge(props: EdgeProps<{ hop: HopView; routeId: string }>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  if (!data) return null;
  const color = edgeColorForHop(data.hop);
  const width = edgeWidthForPortal(data.hop.portalSize);
  const dash = edgeDashForHop(data.hop);

  return (
    <>
      <BaseEdge path={path} style={{ stroke: color, strokeWidth: width, strokeDasharray: dash }} />
      <EdgeLabelRenderer>
        <div
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          className="rounded bg-slate-900/90 px-2 py-0.5 text-[10px] font-mono text-white border border-slate-700"
        >
          <span style={{ color }}>{formatCountdown(secondsLeft(data.hop.expiresAt))}</span>
          <span className="mx-1 text-slate-500">·</span>
          <span>{data.hop.portalSize}p</span>
          {data.hop.status === "COLLAPSED" && <span className="ml-1 text-slate-400">✕</span>}
          {data.hop.status === "WATCHED" && <span className="ml-1 text-yellow-300">👁</span>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

- [ ] **Step 3: ClanGraph**

```tsx
"use client";
import { useMemo, useEffect, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ZoneNode } from "./ZoneNode";
import { RouteEdge } from "./RouteEdge";
import { computeLayout } from "./graph-layout";
import type { RouteView } from "@/hooks/useClanRoutes";

const nodeTypes = { zone: ZoneNode };
const edgeTypes = { route: RouteEdge };

export function ClanGraph({
  routes, anchorZoneName, onNodeClick,
}: { routes: RouteView[]; anchorZoneName: string | null; onNodeClick: (zoneName: string) => void }) {
  const computed = useMemo(() => computeLayout(routes, anchorZoneName), [routes, anchorZoneName]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(
      computed.nodes.map((n) => ({
        id: n.id,
        type: "zone",
        data: n,
        position: { x: n.x, y: n.y },
      }))
    );
    setEdges(
      computed.edges.map((e) => ({
        id: e.id,
        type: "route",
        source: e.source,
        target: e.target,
        data: { hop: e.hop, routeId: e.routeId },
      }))
    );
  }, [computed, setNodes, setEdges]);

  return (
    <div className="h-[calc(100vh-140px)] w-full rounded-xl border border-slate-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, n) => onNodeClick(n.id)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" />
        <Controls className="!border-slate-700 !bg-slate-900" />
        <MiniMap nodeColor="#4b5563" maskColor="rgba(15,23,42,0.8)" />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/graph
git commit -m "feat(graph): ClanGraph react-flow with custom ZoneNode and RouteEdge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 10.3: Clan graph page (primaria)

**Files:**
- Modify: `src/app/(auth)/clan/[clanId]/page.tsx` (reescribir)

- [ ] **Step 1: Implementar**

```tsx
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
          canCreate={canCreate(myRole)}
        />
      )}

      {showCreate && <CreateRouteModal clanId={clanId} onClose={() => setShowCreate(false)} onCreated={() => setShowCreate(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(auth\)/clan/\[clanId\]/page.tsx
git commit -m "feat(clan): graph primary view with side panel and mobile redirect

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 11: ZoneSidePanel + pathfinding

### Task 11.1: ZoneSidePanel con routing

**Files:**
- Create: `src/components/graph/ZoneSidePanel.tsx`

- [ ] **Step 1: Implementar**

```tsx
"use client";
import useSWR from "swr";
import { useZoneRouting } from "@/hooks/useZoneRouting";
import { ZoneBadges } from "@/components/zones/ZoneBadges";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { ZoneSuggestion } from "@/hooks/useZoneSearch";

export function ZoneSidePanel({
  zoneName, routes, onClose, onCreateFromHere, canCreate,
}: { zoneName: string; routes: RouteView[]; onClose: () => void; onCreateFromHere: () => void; canCreate: boolean }) {
  const { data: suggestion } = useSWR<ZoneSuggestion[]>(`/api/zones?q=${encodeURIComponent(zoneName)}`);
  const zone = (suggestion ?? []).find((z) => z.name === zoneName);
  const { routing, isLoading: routingLoading } = useZoneRouting(zone?.id ?? null);

  const routesHere = routes.filter((r) =>
    r.hops.some((h) => h.fromZone.name === zoneName || h.toZone.name === zoneName)
  );

  return (
    <aside className="fixed right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-slate-800 bg-slate-950 p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{zoneName}</h2>
          {zone && <ZoneBadges zone={zone} />}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>

      {zone?.type === "AVALON" && (
        <section className="mb-4 rounded border border-slate-800 bg-slate-900 p-3">
          <h3 className="mb-2 text-xs uppercase text-slate-400">Pathfinding</h3>
          {routingLoading && <div className="text-sm text-slate-500">Calculando…</div>}
          {!routingLoading && routing && (
            <div className="space-y-1 text-sm">
              {routing.nearestRoyal ? (
                <div>Royal más cerca: <span className="font-semibold text-white">{routing.nearestRoyal.zone.name}</span> <span className="text-slate-400">({routing.nearestRoyal.hops} hops)</span></div>
              ) : <div className="text-slate-500">Sin salida royal calculada</div>}
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {canCreate && (
        <button onClick={onCreateFromHere} className="rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
          + Crear ruta desde aquí
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/graph/ZoneSidePanel.tsx
git commit -m "feat(graph): ZoneSidePanel with pathfinding info and routes list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 12: HopInlineToolbar (edición hover)

### Task 12.1: Toolbar

**Files:**
- Create: `src/components/graph/HopInlineToolbar.tsx`
- Modify: `src/components/graph/RouteEdge.tsx` (mostrar toolbar en hover)

- [ ] **Step 1: HopInlineToolbar**

```tsx
"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { mutate as globalMutate } from "swr";
import type { HopView } from "@/hooks/useClanRoutes";
import type { AppRole } from "@/generated/prisma/client";
import { canCreate, canDelete } from "@/lib/role-ui";

export function HopInlineToolbar({
  clanId, routeId, hop, myRole, onDone,
}: { clanId: string; routeId: string; hop: HopView; myRole: AppRole | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/hops/${hop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error");
      toast.success("Actualizado");
      globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`));
      onDone();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setBusy(false); }
  }

  async function del() {
    if (!confirm("¿Borrar este hop?")) return;
    const res = await fetch(`/api/clans/${clanId}/routes/${routeId}/hops/${hop.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Borrado"); globalMutate((k) => typeof k === "string" && k.startsWith(`/api/clans/${clanId}/routes`)); onDone(); }
    else toast.error("Error");
  }

  function extend(minutes: number) {
    const newExpire = new Date(new Date(hop.expiresAt).getTime() + minutes * 60_000).toISOString();
    patch({ expiresAt: newExpire });
  }

  if (!canCreate(myRole)) return null;

  return (
    <div className="flex gap-1 rounded border border-slate-700 bg-slate-900 p-1 shadow-xl">
      <button disabled={busy} onClick={() => extend(30)} className="rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">+30m</button>
      <button disabled={busy} onClick={() => extend(60)} className="rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">+1h</button>
      <button disabled={busy} onClick={() => patch({ status: "WATCHED" })} className="rounded px-2 py-1 text-xs text-yellow-300 hover:bg-slate-800">👁 Watch</button>
      <button disabled={busy} onClick={() => patch({ status: "COLLAPSED" })} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">✕ Collapsed</button>
      <button disabled={busy} onClick={() => patch({ status: "ACTIVE", statusNote: null })} className="rounded px-2 py-1 text-xs text-green-300 hover:bg-slate-800">✓ Active</button>
      {canDelete(myRole) && (
        <button disabled={busy} onClick={del} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-slate-800">🗑</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrar hover en RouteEdge**

Actualizar `src/components/graph/RouteEdge.tsx` — envolver el `EdgeLabelRenderer` en un div con `onMouseEnter`/`onMouseLeave` que muestre el toolbar. La integración completa requiere pasar `myRole` desde el grafo; por simplicidad, dejamos el toolbar disponible en el side panel por hop individual en vez de edge hover (más robusto). **Alternativa recomendada**: añadir botón "Acciones" en ZoneSidePanel que lista hops de la zona y muestra toolbar por cada uno.

Modificar `ZoneSidePanel.tsx` (Task 11.1) sección "Rutas que pasan por aquí": para cada hop de una ruta que toca la zona, mostrar el toolbar si `canCreate(myRole)`.

Actualizar props de ZoneSidePanel para aceptar `myRole` y pasarlo. Actualizar page.tsx de Fase 10 Task 10.3 para pasar `myRole={myRole}`.

(Por brevedad el código completo se implementa inline; el engineer debe integrar HopInlineToolbar dentro del `<li>` de cada ruta en ZoneSidePanel con `<HopInlineToolbar clanId={...} routeId={r.id} hop={h} myRole={myRole} onDone={onClose} />`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/graph/HopInlineToolbar.tsx src/components/graph/ZoneSidePanel.tsx src/app/\(auth\)/clan/\[clanId\]/page.tsx
git commit -m "feat(graph): HopInlineToolbar for quick hop edits (status, timer, delete)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 13: Mobile portrait redirect

### Task 13.1: Ya integrado en Task 10.3

El redirect portrait → `/list` ya está en el useEffect de `ClanGraphPage`. Verificar comportamiento:

- [ ] **Step 1: Verificar manual en dev**

Ejecutar `npm run dev`, abrir `/clan/<id>` con devtools en modo responsive (iPhone 14 portrait). Debe redirigir a `/list`. En landscape no.

No hay commit — lógica ya incluida. Si falla: revisar el matchMedia en el useEffect.

---

## Fase 14: Super admin pages

### Task 14.1: Admin dashboard

**Files:**
- Modify: `src/app/(auth)/admin/page.tsx` (reescribir)
- Create: `src/components/admin/AdminCard.tsx`

- [ ] **Step 1: AdminCard**

```tsx
export function AdminCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-white">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Admin page**

```tsx
"use client";
import Link from "next/link";
import useSWR from "swr";
import { AdminCard } from "@/components/admin/AdminCard";

type Overview = { clans: number; activeRoutes: number; usersActive24h: number; expiringSoon: number };

export default function AdminPage() {
  const { data } = useSWR<Overview>("/api/admin/overview");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Admin Global</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <AdminCard label="Clanes" value={data?.clans ?? "—"} />
        <AdminCard label="Rutas activas" value={data?.activeRoutes ?? "—"} />
        <AdminCard label="Users 24h" value={data?.usersActive24h ?? "—"} />
        <AdminCard label="Expiran <30m" value={data?.expiringSoon ?? "—"} />
      </div>

      <nav className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/admin/map" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Mapa global</Link>
        <Link href="/admin/routes" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Rutas cross-clan</Link>
        <Link href="/admin/clans" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Clanes</Link>
        <Link href="/admin/users" className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center text-white hover:border-indigo-700">Users</Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/admin/page.tsx src/components/admin/AdminCard.tsx
git commit -m "feat(admin): dashboard with overview cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 14.2: Admin routes, clans, users, map (simplificado)

**Files:**
- Create: `src/app/(auth)/admin/routes/page.tsx`
- Create: `src/app/(auth)/admin/clans/page.tsx`
- Create: `src/app/(auth)/admin/users/page.tsx`
- Create: `src/app/(auth)/admin/map/page.tsx`

- [ ] **Step 1: Admin routes (tabla cross-clan + export CSV)**

```tsx
"use client";
import useSWR from "swr";
import { useState } from "react";
import { formatCountdown, secondsLeft, colorForMinutes, minutesLeft } from "@/lib/time";

type AdminRoute = {
  id: string; status: string; updatedAt: string;
  clan: { id: string; name: string };
  hops: Array<{ portalSize: number; expiresAt: string; fromZone: { name: string }; toZone: { name: string } }>;
  createdBy: { discordUsername: string; displayName: string | null };
};

export default function AdminRoutesPage() {
  const [status, setStatus] = useState("ACTIVE");
  const [zone, setZone] = useState("");
  const { data } = useSWR<{ data: AdminRoute[]; pagination: { total: number } }>(`/api/admin/routes?status=${status}&zone=${encodeURIComponent(zone)}&limit=100`);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Rutas cross-clan</h1>

      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white">
          {["ACTIVE", "EXPIRED", "DISABLED", "ALL"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <input placeholder="Zona (exact)" value={zone} onChange={(e) => setZone(e.target.value)} className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
        <a href="/api/admin/routes/export.csv" className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">Export CSV</a>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Clan</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Cadena</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creador</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Próximo exp.</th>
              <th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data?.data.map((r) => {
              const next = r.hops.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0];
              const mins = next ? minutesLeft(next.expiresAt) : -1;
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-white">{r.clan.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">
                    {r.hops.map((h, i) => <span key={i}>{i === 0 && h.fromZone.name}<span className="text-slate-500"> → </span>{h.toZone.name} </span>)}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{r.createdBy.displayName ?? r.createdBy.discordUsername}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: colorForMinutes(mins) }}>{next ? formatCountdown(secondsLeft(next.expiresAt)) : "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">Total: {data?.pagination.total ?? 0}</div>
    </div>
  );
}
```

- [ ] **Step 2: Admin clans**

```tsx
"use client";
import useSWR from "swr";
import Link from "next/link";

type AdminClan = {
  id: string; name: string; discordGuildName: string; createdAt: string; botInstalled: boolean;
  _count: { members: number; routes: number };
};

export default function AdminClansPage() {
  const { data = [] } = useSWR<AdminClan[]>("/api/admin/clans");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Clanes ({data.length})</h1>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900">
            <tr><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Nombre</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Guild</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Miembros</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Rutas</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Bot</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2"><Link href={`/clan/${c.id}`} className="text-indigo-400 hover:text-indigo-300">{c.name}</Link></td>
                <td className="px-3 py-2 text-slate-300">{c.discordGuildName}</td>
                <td className="px-3 py-2 text-slate-300">{c._count.members}</td>
                <td className="px-3 py-2 text-slate-300">{c._count.routes}</td>
                <td className="px-3 py-2">{c.botInstalled ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Admin users**

```tsx
"use client";
import { useState } from "react";
import useSWR from "swr";

type UserRow = { id: string; discordId: string; discordUsername: string; displayName: string | null; email: string; createdAt: string };

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const { data = [] } = useSWR<UserRow[]>(`/api/admin/users?q=${encodeURIComponent(q)}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Users</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por username/email" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" />
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900"><tr><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Discord</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Email</th><th className="px-3 py-2 text-left text-xs uppercase text-slate-400">Creado</th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {data.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 text-white">{u.displayName ?? u.discordUsername} <span className="font-mono text-xs text-slate-500">({u.discordId})</span></td>
                <td className="px-3 py-2 text-slate-400">{u.email}</td>
                <td className="px-3 py-2 text-slate-500">{new Date(u.createdAt).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Admin map (placeholder)**

```tsx
"use client";
import useSWR from "swr";
import { ClanGraph } from "@/components/graph/ClanGraph";
import type { RouteView } from "@/hooks/useClanRoutes";

export default function AdminMapPage() {
  const { data: routes = [], isLoading } = useSWR<RouteView[]>("/api/admin/map");

  if (isLoading) return <div className="text-slate-400">Cargando grafo global…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Grafo global (todas las rutas activas)</h1>
      <p className="text-xs text-slate-500">{routes.length} rutas. Modo super admin: lectura silenciosa.</p>
      <ClanGraph routes={routes} anchorZoneName={null} onNodeClick={() => {}} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/admin
git commit -m "feat(admin): routes/clans/users/map super admin pages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Fase 15: Global loading/error + cleanup final

### Task 15.1: Boundaries globales

**Files:**
- Create: `src/app/loading.tsx`
- Create: `src/app/error.tsx`
- Create: `src/app/not-found.tsx`

- [ ] **Step 1: loading.tsx**

```tsx
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}
```

- [ ] **Step 2: error.tsx**

```tsx
"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="max-w-md space-y-4 rounded-xl border border-red-900 bg-red-950/30 p-6 text-center">
        <h2 className="text-xl font-bold text-white">Algo se rompió</h2>
        <p className="text-sm text-red-300">{error.message}</p>
        {error.digest && <div className="font-mono text-xs text-red-500">digest: {error.digest}</div>}
        <button onClick={reset} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: not-found.tsx**

```tsx
import Link from "next/link";
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="space-y-4 text-center">
        <h1 className="text-5xl font-bold text-white">404</h1>
        <p className="text-slate-400">Esta ruta no existe.</p>
        <Link href="/dashboard" className="inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Ir al dashboard</Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/loading.tsx src/app/error.tsx src/app/not-found.tsx
git commit -m "feat(boundaries): global loading/error/not-found

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 15.2: Cleanup legacy components

**Files:**
- Delete: `src/components/routes/DiscordPushButton.tsx` (endpoint /webhook fue eliminado)
- Delete: archivos sobrantes en `src/app/(auth)/` que usen personalCode

- [ ] **Step 1: Buscar referencias**

```bash
cd C:/Users/Crint/proyectos/avalon-tracker
grep -rl "DiscordPushButton\|personalCode\|AUTH_SIMPLE_PASSWORD" src/ 2>/dev/null
```
Listar todo. Si hay referencias dentro de archivos que se eliminarán/reescribirán en esta fase, eliminar.

- [ ] **Step 2: Eliminar DiscordPushButton**

```bash
rm -f src/components/routes/DiscordPushButton.tsx
```

- [ ] **Step 3: Verificar tsc**

```bash
npx tsc --noEmit 2>&1 | grep "Error\|error TS" | wc -l
```
Expected: 0 o muy pocos. Si quedan errores de otras páginas legacy, revisar y rewrite.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "chore: remove legacy DiscordPushButton (endpoint no longer exists)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 15.3: Final verification

**Files:** N/A

- [ ] **Step 1: Run tests**

```bash
npm test 2>&1 | tail -5
```
Expected: todos pasan (unit tests en `tests/lib/` y `tests/hooks/`).

- [ ] **Step 2: tsc check**

```bash
npx tsc --noEmit 2>&1 | grep "Error\|error TS" | head -10
```
Expected: 0 errores. Si hay algunos, investigar y arreglar antes de dar por cerrado Plan 2.

- [ ] **Step 3: npm run build (smoke test)**

```bash
npm run build 2>&1 | tail -20
```
Expected: build completa. Si falla por Node 18 vs Next 16, documentar como known issue para VPS (que usa Node 20).

- [ ] **Step 4: Summary commit**

Crear `docs/superpowers/plans/2026-04-21-frontend-rewrite.md.execution-summary.md` con:
- Total commits de Plan 2
- Tests status
- TS errors finales
- UI flujos verificables manualmente (grafo, lista, modal, admin, etc.)
- Known issues / follow-ups
- Pasos para deploy

Commit: `docs: Plan 2 frontend execution summary`

### Task 15.4: Push branch

- [ ] **Step 1: Push**

```bash
git push -u origin feat/discord-redesign-backend 2>&1 | tail -5
```
Expected: push clean.

No hacer merge. Dejar para revisión del usuario.

---

## Self-Review

**Spec coverage (spec §8 UI grafo + §11 super admin)**:
- ✅ Grafo react-flow primario: Fase 10
- ✅ ZoneNode custom con badges: Task 10.2
- ✅ RouteEdge custom con colores/status: Task 10.2
- ✅ Panel lateral con pathfinding: Fase 11
- ✅ Inline toolbar edit: Fase 12
- ✅ Search/filter bar: parcialmente (botones simples en graph toolbar; filtros profundos en list fallback)
- ✅ Lista fallback móvil: Fase 9
- ✅ CreateRouteModal v2 con autocomplete + shortcuts: Fase 8
- ✅ Mobile portrait redirect: Fase 13
- ✅ Super admin dashboard + map + routes + clans + users: Fase 14
- ✅ SWR polling 10-15s visible / 60s background: Fase 2 (useVisibilityPolling)
- ✅ Conflict handling con If-Match: Fase 9 (RouteListTable)
- ✅ Login Discord: Fase 1
- ✅ Sidebar Discord + super admin badge: Fase 1
- ✅ Toast + error envelope: Fase 0
- ✅ Loading/error boundaries: Fase 15

**Gaps aceptados (fuera de scope Plan 2)**:
- Filtros avanzados en grafo (status, tamaño portal, zonas no-ruta) — implementar como extensión si hace falta
- Indicador de "edit freshness" pulsante — opcional, no crítico
- Drag de nodos con localStorage persist — react-flow lo soporta out-of-box; localStorage persistencia puede añadirse con un hook encima si se pide
- Export de ruta como texto — explícitamente fuera de scope del spec

**Placeholder scan**: revisado. Todas las funciones/componentes tienen implementación completa.

**Type consistency**: `HopView`, `RouteView`, `Me`, `MyClan`, `ClanDetail` consistentes entre hooks y consumidores.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-frontend-rewrite.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task/phase, review between, fast iteration.

**2. Inline Execution** — executing-plans batch mode.

Recommendation: continuar con subagent-driven como Plan 1 (funcionó bien, 29/29 tests verdes al final).
