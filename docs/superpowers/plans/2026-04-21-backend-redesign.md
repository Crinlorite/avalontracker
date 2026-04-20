# Avalon Tracker — Backend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el backend completo de Avalon Tracker: nueva BD (big-bang), Discord OAuth, dependencia con Vigil Bot, 4 roles jerárquicos con mapping many-to-many, API endpoints completa, security hardening, polling delta, observabilidad mínima y deploy actualizado. Al terminar, el backend es 100% funcional y testeable con curl; la UI legacy sigue renderizando con un shim mínimo.

**Architecture:** Next.js 16 App Router + Prisma v7 (PrismaPg) + PostgreSQL, NextAuth v5 con provider Discord (scopes `identify email`), Vigil Bot como autoridad de roles vía HTTP (con mock local para dev). Permisos resueltos por el bot; Tracker cachea con LRU TTL 30min e invalida vía webhooks HMAC. Socket.io se mantiene solo para expiración de hops. Big-bang migration: `prisma migrate reset --force`.

**Tech Stack:** Next.js 16.1.6, React 19.2.3, NextAuth v5.0.0-beta, Prisma v7.4.2 + `@prisma/adapter-pg`, PostgreSQL 16, Socket.io 4.8.3, `@auth/prisma-adapter`, `zod`, `lru-cache`, `pino`, `pino-http`, `tsx` para scripts.

---

## File Structure

### Nuevos archivos

```
src/lib/
  discord-client.ts          Fetch wrapper para Discord REST API (si hace falta; mayoría via bot)
  vigil-bot-client.ts        HTTP client hacia Vigil Bot + circuit breaker
  vigil-bot-mock.ts          Mock en memoria para desarrollo local
  permissions.ts             (refactor) resolución de rol + super admin + cache LRU
  rate-limit.ts              Token bucket in-memory con lru-cache
  hmac.ts                    Helpers de firma/verificación HMAC
  logger.ts                  Instancia pino + configuración
  api-error.ts               Clase error uniforme + helpers 4xx/5xx
  version-check.ts           Optimistic concurrency helper (If-Match header)

src/lib/auth.ts              (reescritura) Discord provider, callbacks
src/lib/auth.config.ts       (reescritura) config Edge-safe

src/middleware.ts            (reescritura) gate auth + superadmin

src/app/api/me/route.ts
src/app/api/me/clans/route.ts
src/app/api/me/refresh-roles/route.ts
src/app/api/clans/route.ts                                  (POST nuevo)
src/app/api/clans/[clanId]/route.ts                         (reescritura)
src/app/api/clans/[clanId]/members/route.ts                 (reescritura)
src/app/api/clans/[clanId]/members/[memberId]/route.ts     (reescritura)
src/app/api/clans/[clanId]/role-mappings/route.ts          (nuevo)
src/app/api/clans/[clanId]/role-mappings/[id]/route.ts     (nuevo)
src/app/api/clans/[clanId]/discord-roles/route.ts          (nuevo — proxy a bot)
src/app/api/clans/[clanId]/routes/route.ts                 (reescritura + ?since=)
src/app/api/clans/[clanId]/routes/[routeId]/route.ts       (reescritura)
src/app/api/clans/[clanId]/routes/[routeId]/hops/[hopId]/route.ts  (nuevo)
src/app/api/clans/[clanId]/audit/route.ts                  (update roles)
src/app/api/clans/[clanId]/webhook-test/route.ts           (nuevo)
src/app/api/zones/route.ts                                  (existente, mejora response)
src/app/api/zones/[zoneId]/route.ts                        (nuevo)
src/app/api/zones/[zoneId]/routing/route.ts                (nuevo)
src/app/api/webhooks/vigil/role-change/route.ts            (nuevo)
src/app/api/webhooks/vigil/member-leave/route.ts           (nuevo)
src/app/api/webhooks/vigil/guild-update/route.ts           (nuevo)
src/app/api/health/route.ts                                 (nuevo)
src/app/api/admin/overview/route.ts                         (nuevo)
src/app/api/admin/routes/route.ts                           (nuevo)
src/app/api/admin/routes/export.csv/route.ts                (nuevo)
src/app/api/admin/clans/route.ts                            (nuevo)
src/app/api/admin/users/route.ts                            (nuevo)
src/app/api/admin/map/route.ts                              (nuevo)

scripts/
  seed-zones.ts              (mejora de scripts/seed.ts existente)
  import-world-graph.ts      (nuevo — pobla ZoneConnection)
  precompute-routing.ts      (nuevo — BFS + ZoneRouting)
  mock-vigil-bot.ts          (nuevo — servidor Express fake para dev)

tests/lib/
  permissions.test.ts
  hmac.test.ts
  vigil-bot-client.test.ts
  rate-limit.test.ts
  version-check.test.ts
scripts/__tests__/
  precompute-routing.test.ts

docs/superpowers/plans/
  2026-04-21-backend-redesign.md  (este archivo)
```

### Archivos modificados

```
prisma/schema.prisma                                       reescritura completa
src/generated/prisma/*                                     regenerado tras schema
server.ts                                                   CORS Socket.io + handshake auth
next.config.ts                                             headers + remotePatterns cdn.discordapp.com
Dockerfile                                                  CMD con nuevos seeds
package.json                                                nuevas deps: pino, pino-http, lru-cache, vitest
src/types/next-auth.d.ts                                    nueva Session shape
src/lib/audit.ts                                            super admin bypass silencioso
src/lib/prisma.ts                                           pool size via env
README.md                                                    nuevas env vars + CF Access opcional
.env.example                                                todas las env vars nuevas
```

### Archivos eliminados

```
src/lib/invite-codes.ts
src/app/api/invite-codes/route.ts
src/app/api/profile/code/route.ts
src/app/api/external/route/route.ts
src/app/api/external/zone-change/route.ts
```

---

## Fases

Cada fase produce un checkpoint de progreso. Commits frecuentes dentro de fase. Al final de cada fase, `npm run build` debe pasar.

- **Fase 0**: Preparación (branch, deps, config base)
- **Fase 1**: Prisma schema reset
- **Fase 2**: Libs puras testeables (permissions, hmac, rate-limit, version-check, logger)
- **Fase 3**: Vigil Bot client + mock
- **Fase 4**: Discord OAuth (NextAuth + callbacks + middleware)
- **Fase 5**: API — clanes y role mappings
- **Fase 6**: API — routes y hops (con version concurrency)
- **Fase 7**: API — zonas + pathfinding + seeds
- **Fase 8**: API — polling delta + audit + webhook-test
- **Fase 9**: API — webhooks entrantes desde Vigil Bot
- **Fase 10**: API — super admin
- **Fase 11**: Security hardening (Socket.io auth, CORS, headers, rate-limit wiring)
- **Fase 12**: Observabilidad + /api/health
- **Fase 13**: Limpieza (eliminar código legacy) + deploy updates

---

## Fase 0: Preparación

### Task 0.1: Crear branch de trabajo

**Files:** N/A (git)

- [ ] **Step 1: Crear branch**

```bash
cd C:/Users/Crint/proyectos/avalon-tracker
git checkout -b feat/discord-redesign-backend
```

- [ ] **Step 2: Verificar estado limpio**

Run: `git status`
Expected: "On branch feat/discord-redesign-backend · nothing to commit, working tree clean"

### Task 0.2: Instalar nuevas dependencias

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar runtime deps**

```bash
npm install pino pino-http lru-cache
```

- [ ] **Step 2: Instalar dev deps**

```bash
npm install -D vitest @vitest/ui @types/express
```

- [ ] **Step 3: Verificar package.json tiene las deps**

Run: `node -e "const p=require('./package.json'); console.log(p.dependencies.pino, p.dependencies['pino-http'], p.dependencies['lru-cache'])"`
Expected: tres versiones válidas, no `undefined`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pino, lru-cache, vitest"
```

### Task 0.3: Configurar Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Crear vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "scripts/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Añadir scripts a package.json**

En `package.json`, en la sección `scripts`, añadir:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verificar que vitest corre**

```bash
npm test
```
Expected: "No test files found" o similar (no crash). OK si exit code no es 0 mientras el mensaje indique "no tests".

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure vitest"
```

### Task 0.4: Añadir env vars nuevas a .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Actualizar .env.example**

Abrir `.env.example` y reemplazar su contenido por:

```env
# --- Next.js ---
AUTH_SECRET=change-me-to-32-bytes-random-base64
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Discord OAuth (https://discord.com/developers/applications) ---
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# --- Vigil Bot integration ---
VIGIL_BOT_API_URL=http://localhost:4000
VIGIL_BOT_SHARED_SECRET=change-me-to-32-bytes-random

# --- Super admin ---
SUPER_ADMIN_DISCORD_IDS=

# --- Database ---
DATABASE_URL=postgresql://user:pass@localhost:5432/avalon
PRISMA_CLIENT_POOL_SIZE=5

# --- Feature flags ---
NODE_ENV=development
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: update .env.example with new env vars"
```

---

## Fase 1: Prisma schema reset

### Task 1.1: Reescribir prisma/schema.prisma

**Files:**
- Modify: `prisma/schema.prisma` (reescritura completa)

- [ ] **Step 1: Reemplazar schema.prisma**

Reemplazar el contenido completo de `prisma/schema.prisma` por:

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "esm"
  runtime      = "nodejs"
  previewFeatures = ["queryCompiler", "driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============ Enums ============

enum ZoneType {
  AVALON
  ROYAL
  OUTLANDS
}

enum RouteStatus {
  ACTIVE
  EXPIRED
  DISABLED
}

enum RouteHopStatus {
  ACTIVE
  EXPIRED
  COLLAPSED
  WATCHED
}

enum AppRole {
  VIEWER
  CONTRIBUTOR
  EDITOR
  ADMIN
}

// ============ Auth (NextAuth) ============

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime
  @@unique([identifier, token])
}

// ============ User ============

model User {
  id               String       @id @default(cuid())
  discordId        String       @unique
  discordUsername  String
  discordAvatar    String?
  globalNickname   String?
  email            String       @unique
  displayName      String?
  image            String?
  isSuperAdmin     Boolean      @default(false)
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  accounts         Account[]
  sessions         Session[]
  clansCreated     Clan[]       @relation("ClanCreator")
  clanMembers      ClanMember[]
  routesCreated    Route[]      @relation("RouteCreator")
  routesDisabled   Route[]      @relation("RouteDisabler")
  hopStatusSet     RouteHop[]   @relation("HopStatusSetter")
  auditLogs        AuditLog[]
}

// ============ Clan ============

model Clan {
  id                 String             @id @default(cuid())
  name               String             @unique
  discordGuildId     String             @unique
  discordGuildName   String
  discordGuildIcon   String?
  discordWebhookUrl  String?
  anchorZoneId       Int?
  botInstalled       Boolean            @default(false)
  tier               String?
  createdById        String
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  createdBy          User               @relation("ClanCreator", fields: [createdById], references: [id])
  anchorZone         Zone?              @relation("ClanAnchor", fields: [anchorZoneId], references: [id])
  members            ClanMember[]
  routes             Route[]
  auditLogs          AuditLog[]
  roleMappings       ClanRoleMapping[]
}

model ClanRoleMapping {
  id               Int      @id @default(autoincrement())
  clanId           String
  discordRoleId    String
  discordRoleName  String
  appRole          AppRole
  createdAt        DateTime @default(now())

  clan             Clan     @relation(fields: [clanId], references: [id], onDelete: Cascade)

  @@unique([clanId, discordRoleId])
  @@index([clanId])
}

model ClanMember {
  id          Int       @id @default(autoincrement())
  userId      String
  clanId      String
  appRole     AppRole?
  roleSource  String?
  lastSyncAt  DateTime?
  joinedAt    DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)

  @@unique([userId, clanId])
  @@index([clanId])
}

// ============ Zone + world graph ============

model Zone {
  id           Int              @id @default(autoincrement())
  name         String           @unique
  type         ZoneType
  tier         Int?
  hasHideout   Boolean          @default(false)
  hasDungeon   Boolean          @default(false)
  isRest       Boolean          @default(false)
  isCapital    Boolean          @default(false)
  rawData      Json?

  connectionsFrom   ZoneConnection[] @relation("ConnectionFrom")
  connectionsTo     ZoneConnection[] @relation("ConnectionTo")
  routingFrom       ZoneRouting?     @relation("RoutingFrom")
  routingRoyalRef   ZoneRouting[]    @relation("RoutingRoyal")
  routingRestRef    ZoneRouting[]    @relation("RoutingRest")
  clanAnchorFor     Clan[]           @relation("ClanAnchor")
  hopsFrom          RouteHop[]       @relation("HopFrom")
  hopsTo            RouteHop[]       @relation("HopTo")

  @@index([name])
  @@index([type])
  @@index([tier])
}

model ZoneConnection {
  id             Int      @id @default(autoincrement())
  fromZoneId     Int
  toZoneId       Int
  connectionType String

  fromZone       Zone     @relation("ConnectionFrom", fields: [fromZoneId], references: [id])
  toZone         Zone     @relation("ConnectionTo",   fields: [toZoneId],   references: [id])

  @@unique([fromZoneId, toZoneId])
  @@index([fromZoneId])
}

model ZoneRouting {
  zoneId              Int      @id
  nearestRoyalZoneId  Int?
  hopsToRoyal         Int?
  nearestRestZoneId   Int?
  hopsToRest          Int?
  computedAt          DateTime @default(now())

  zone                Zone     @relation("RoutingFrom", fields: [zoneId],             references: [id])
  nearestRoyal        Zone?    @relation("RoutingRoyal", fields: [nearestRoyalZoneId], references: [id])
  nearestRest         Zone?    @relation("RoutingRest",  fields: [nearestRestZoneId],  references: [id])
}

// ============ Routes ============

model Route {
  id            String        @id @default(cuid())
  clanId        String
  createdById   String
  disabledById  String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  disabledAt    DateTime?
  status        RouteStatus   @default(ACTIVE)
  notes         String?
  version       Int           @default(1)

  clan          Clan          @relation(fields: [clanId], references: [id], onDelete: Cascade)
  createdBy     User          @relation("RouteCreator",  fields: [createdById],  references: [id])
  disabledBy    User?         @relation("RouteDisabler", fields: [disabledById], references: [id])
  hops          RouteHop[]

  @@index([clanId, status])
  @@index([updatedAt])
}

model RouteHop {
  id             Int             @id @default(autoincrement())
  routeId        String
  order          Int
  fromZoneId     Int
  toZoneId       Int
  portalSize     Int
  expiresAt      DateTime
  status         RouteHopStatus  @default(ACTIVE)
  statusNote     String?
  statusSetById  String?
  statusSetAt    DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  route          Route           @relation(fields: [routeId], references: [id], onDelete: Cascade)
  fromZone       Zone            @relation("HopFrom",         fields: [fromZoneId],    references: [id])
  toZone         Zone            @relation("HopTo",           fields: [toZoneId],      references: [id])
  statusSetBy    User?           @relation("HopStatusSetter", fields: [statusSetById], references: [id])

  @@index([routeId])
  @@index([expiresAt, status])
}

// ============ Audit ============

model AuditLog {
  id        Int      @id @default(autoincrement())
  clanId    String
  userId    String
  action    String
  targetId  String?
  details   Json?
  createdAt DateTime @default(now())

  clan      Clan     @relation(fields: [clanId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])

  @@index([clanId, createdAt(sort: Desc)])
}
```

- [ ] **Step 2: Crear nueva migración**

```bash
# Asumiendo que hay una BD local dev levantada (docker-compose up db -d).
npx prisma migrate reset --force
npx prisma migrate dev --name discord_redesign_big_bang
```
Expected: genera `prisma/migrations/YYYYMMDDHHMMSS_discord_redesign_big_bang/` con SQL de reset completo.

- [ ] **Step 3: Regenerar cliente**

```bash
npx prisma generate
```
Expected: `src/generated/prisma/` actualizado, sin errores.

- [ ] **Step 4: Verificar build**

```bash
npm run build
```
Expected: build pasa (puede haber errores de tipo en el código viejo — los arreglaremos por fases).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma
git commit -m "feat(db): big-bang schema reset for Discord redesign"
```

---

## Fase 2: Libs puras testeables

### Task 2.1: permissions.ts — resolveAppRole

**Files:**
- Create: `src/lib/permissions.ts`
- Test: `tests/lib/permissions.test.ts`

- [ ] **Step 1: Escribir test (falla)**

Crear `tests/lib/permissions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAppRole, ROLE_HIERARCHY } from "@/lib/permissions";
import type { AppRole } from "@/generated/prisma/client";

const mappings = [
  { clanId: "c1", discordRoleId: "r_admin",  discordRoleName: "Admin",  appRole: "ADMIN"       as AppRole, id: 1, createdAt: new Date() },
  { clanId: "c1", discordRoleId: "r_editor", discordRoleName: "Editor", appRole: "EDITOR"      as AppRole, id: 2, createdAt: new Date() },
  { clanId: "c1", discordRoleId: "r_vet",    discordRoleName: "Vet",    appRole: "EDITOR"      as AppRole, id: 3, createdAt: new Date() },
  { clanId: "c1", discordRoleId: "r_memb",   discordRoleName: "Member", appRole: "CONTRIBUTOR" as AppRole, id: 4, createdAt: new Date() },
];

describe("resolveAppRole", () => {
  it("returns null when user has no mapped roles", () => {
    expect(resolveAppRole([], mappings)).toBeNull();
    expect(resolveAppRole(["r_random"], mappings)).toBeNull();
  });

  it("returns the mapped role when user has exactly one", () => {
    expect(resolveAppRole(["r_memb"], mappings)).toBe("CONTRIBUTOR");
  });

  it("returns the highest role when user has multiple mapped", () => {
    expect(resolveAppRole(["r_memb", "r_editor"], mappings)).toBe("EDITOR");
    expect(resolveAppRole(["r_memb", "r_editor", "r_admin"], mappings)).toBe("ADMIN");
  });

  it("handles duplicates of same app role", () => {
    expect(resolveAppRole(["r_editor", "r_vet"], mappings)).toBe("EDITOR");
  });
});

describe("ROLE_HIERARCHY", () => {
  it("orders roles correctly", () => {
    expect(ROLE_HIERARCHY.VIEWER).toBeLessThan(ROLE_HIERARCHY.CONTRIBUTOR);
    expect(ROLE_HIERARCHY.CONTRIBUTOR).toBeLessThan(ROLE_HIERARCHY.EDITOR);
    expect(ROLE_HIERARCHY.EDITOR).toBeLessThan(ROLE_HIERARCHY.ADMIN);
  });
});
```

- [ ] **Step 2: Correr test, ver que falla**

```bash
npm test -- permissions
```
Expected: FAIL "Cannot find module '@/lib/permissions'"

- [ ] **Step 3: Implementar lib/permissions.ts**

Crear `src/lib/permissions.ts`:

```ts
import type { AppRole, ClanRoleMapping } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const ROLE_HIERARCHY: Record<AppRole, number> = {
  VIEWER: 1,
  CONTRIBUTOR: 2,
  EDITOR: 3,
  ADMIN: 4,
};

export function resolveAppRole(
  userDiscordRoleIds: string[],
  mappings: Pick<ClanRoleMapping, "discordRoleId" | "appRole">[]
): AppRole | null {
  const matched = mappings
    .filter((m) => userDiscordRoleIds.includes(m.discordRoleId))
    .map((m) => m.appRole);

  if (matched.length === 0) return null;

  return matched.reduce((max, r) =>
    ROLE_HIERARCHY[r] > ROLE_HIERARCHY[max] ? r : max
  );
}

export function hasMinRole(userRole: AppRole | null, minRole: AppRole): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}
```

- [ ] **Step 4: Correr tests, ver que pasan**

```bash
npm test -- permissions
```
Expected: PASS todos los tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts tests/lib/permissions.test.ts
git commit -m "feat(permissions): add resolveAppRole and hierarchy"
```

### Task 2.2: permissions.ts — role cache + requireRole helpers

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: `tests/lib/permissions.test.ts`

- [ ] **Step 1: Añadir tests para requireRole con super admin**

Añadir al final de `tests/lib/permissions.test.ts`:

```ts
import { hasMinRole } from "@/lib/permissions";

describe("hasMinRole", () => {
  it("returns false for null user role", () => {
    expect(hasMinRole(null, "VIEWER")).toBe(false);
  });
  it("returns true when equal", () => {
    expect(hasMinRole("EDITOR", "EDITOR")).toBe(true);
  });
  it("returns true when greater", () => {
    expect(hasMinRole("ADMIN", "EDITOR")).toBe(true);
  });
  it("returns false when less", () => {
    expect(hasMinRole("VIEWER", "EDITOR")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr tests**

```bash
npm test -- permissions
```
Expected: PASS.

- [ ] **Step 3: Añadir role cache LRU y getUserRoleInClan**

Actualizar `src/lib/permissions.ts` añadiendo al final:

```ts
import { LRUCache } from "lru-cache";
import { fetchUserRoleFromBot } from "@/lib/vigil-bot-client";

type CachedRole = {
  appRole: AppRole | null;
  stale: boolean;
  syncedAt: Date;
};

const ROLE_CACHE_TTL_MS = 30 * 60 * 1000;
const roleCache = new LRUCache<string, CachedRole>({
  max: 5000,
  ttl: ROLE_CACHE_TTL_MS,
});

function cacheKey(userId: string, clanId: string): string {
  return `${userId}:${clanId}`;
}

export function invalidateRoleCache(userId: string, clanId?: string): void {
  if (clanId) {
    roleCache.delete(cacheKey(userId, clanId));
    return;
  }
  for (const key of roleCache.keys()) {
    if (key.startsWith(`${userId}:`)) roleCache.delete(key);
  }
}

export async function getUserRoleInClan(
  userId: string,
  clanId: string
): Promise<CachedRole> {
  const key = cacheKey(userId, clanId);
  const hit = roleCache.get(key);
  if (hit) return hit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { discordId: true },
  });
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { discordGuildId: true },
  });
  if (!user || !clan) {
    const miss: CachedRole = { appRole: null, stale: false, syncedAt: new Date() };
    roleCache.set(key, miss);
    return miss;
  }

  try {
    const botResult = await fetchUserRoleFromBot(clan.discordGuildId, user.discordId);
    const fresh: CachedRole = {
      appRole: botResult.computedAppRole,
      stale: false,
      syncedAt: new Date(),
    };
    await prisma.clanMember.upsert({
      where: { userId_clanId: { userId, clanId } },
      create: {
        userId,
        clanId,
        appRole: fresh.appRole,
        roleSource: `discord:${botResult.discordRoleIds.join(",")}`,
        lastSyncAt: fresh.syncedAt,
      },
      update: {
        appRole: fresh.appRole,
        roleSource: `discord:${botResult.discordRoleIds.join(",")}`,
        lastSyncAt: fresh.syncedAt,
      },
    });
    roleCache.set(key, fresh);
    return fresh;
  } catch {
    const fallback = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { appRole: true, lastSyncAt: true },
    });
    const stale: CachedRole = {
      appRole: fallback?.appRole ?? null,
      stale: true,
      syncedAt: fallback?.lastSyncAt ?? new Date(0),
    };
    return stale;
  }
}

export class PermissionError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "NOT_MEMBER" | "INSUFFICIENT_ROLE" | "STALE_DEPENDENCY",
    public status: number,
    public extra?: Record<string, unknown>
  ) {
    super(code);
  }
}

export async function requireRoleOrSuperAdminRead(
  userId: string,
  clanId: string,
  minRole: AppRole,
  method: "GET" | "WRITE"
): Promise<{ bypass: boolean; role: AppRole | null; stale: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  if (!user) throw new PermissionError("UNAUTHORIZED", 401);

  if (user.isSuperAdmin) {
    if (method === "GET") {
      return { bypass: true, role: null, stale: false };
    }
    const own = await getUserRoleInClan(userId, clanId);
    if (!own.appRole) {
      throw new PermissionError("INSUFFICIENT_ROLE", 403, {
        required: minRole,
        have: null,
        superAdminWrite: true,
      });
    }
    if (!hasMinRole(own.appRole, minRole)) {
      throw new PermissionError("INSUFFICIENT_ROLE", 403, {
        required: minRole,
        have: own.appRole,
      });
    }
    return { bypass: false, role: own.appRole, stale: own.stale };
  }

  const current = await getUserRoleInClan(userId, clanId);
  if (current.stale && method === "WRITE") {
    throw new PermissionError("STALE_DEPENDENCY", 503, { reason: "vigil_bot_unreachable" });
  }
  if (!current.appRole) throw new PermissionError("NOT_MEMBER", 403, { clanId });
  if (!hasMinRole(current.appRole, minRole)) {
    throw new PermissionError("INSUFFICIENT_ROLE", 403, {
      required: minRole,
      have: current.appRole,
    });
  }
  return { bypass: false, role: current.appRole, stale: current.stale };
}

export async function isClanMember(userId: string, clanId: string): Promise<boolean> {
  const role = await getUserRoleInClan(userId, clanId);
  return role.appRole !== null && !role.stale;
}
```

- [ ] **Step 4: Correr tests unitarios (las puras siguen pasando)**

```bash
npm test -- permissions
```
Expected: PASS.

- [ ] **Step 5: Verificar que lint+build no rompen (se espera que fallen por imports aún no creados)**

Run: `npx tsc --noEmit`
Expected: errores por `@/lib/vigil-bot-client` no existente — lo crearemos en Fase 3. OK seguir.

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissions.ts tests/lib/permissions.test.ts
git commit -m "feat(permissions): add role cache, requireRoleOrSuperAdminRead"
```

### Task 2.3: hmac.ts

**Files:**
- Create: `src/lib/hmac.ts`
- Test: `tests/lib/hmac.test.ts`

- [ ] **Step 1: Escribir test**

Crear `tests/lib/hmac.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signBody, verifySignature } from "@/lib/hmac";

const SECRET = "test-secret-32-bytes-for-unit-tst";

describe("hmac", () => {
  it("signs a body and verifies it with same secret", () => {
    const body = '{"foo":"bar"}';
    const sig = signBody(body, SECRET);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignature(body, sig, SECRET)).toBe(true);
  });

  it("rejects tampered body", () => {
    const body = '{"foo":"bar"}';
    const sig = signBody(body, SECRET);
    expect(verifySignature('{"foo":"baz"}', sig, SECRET)).toBe(false);
  });

  it("rejects tampered signature", () => {
    const body = '{"foo":"bar"}';
    expect(verifySignature(body, "0".repeat(64), SECRET)).toBe(false);
  });

  it("rejects signature of wrong length (timing safe guard)", () => {
    expect(verifySignature("x", "short", SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver fallo**

```bash
npm test -- hmac
```
Expected: FAIL "Cannot find module '@/lib/hmac'"

- [ ] **Step 3: Implementar hmac.ts**

Crear `src/lib/hmac.ts`:

```ts
import crypto from "node:crypto";

export function signBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = signBody(body, secret);
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- hmac
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hmac.ts tests/lib/hmac.test.ts
git commit -m "feat(security): add hmac sign/verify helpers"
```

### Task 2.4: rate-limit.ts

**Files:**
- Create: `src/lib/rate-limit.ts`
- Test: `tests/lib/rate-limit.test.ts`

- [ ] **Step 1: Escribir test**

Crear `tests/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    // nothing — cada createLimiter es independiente
  });

  it("allows requests under the limit", () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 3 });
    expect(consumeToken(limiter, "k1").ok).toBe(true);
    expect(consumeToken(limiter, "k1").ok).toBe(true);
    expect(consumeToken(limiter, "k1").ok).toBe(true);
  });

  it("blocks once over the limit and reports retryAfterMs", () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 2 });
    consumeToken(limiter, "k1");
    consumeToken(limiter, "k1");
    const blocked = consumeToken(limiter, "k1");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("tracks different keys independently", () => {
    const limiter = createLimiter({ windowMs: 60_000, max: 1 });
    expect(consumeToken(limiter, "a").ok).toBe(true);
    expect(consumeToken(limiter, "b").ok).toBe(true);
    expect(consumeToken(limiter, "a").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver fallo**

```bash
npm test -- rate-limit
```
Expected: FAIL "Cannot find module '@/lib/rate-limit'"

- [ ] **Step 3: Implementar**

Crear `src/lib/rate-limit.ts`:

```ts
import { LRUCache } from "lru-cache";

export type LimiterConfig = {
  windowMs: number;
  max: number;
};

export type Limiter = {
  cache: LRUCache<string, { count: number; resetAt: number }>;
  config: LimiterConfig;
};

export type ConsumeResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

export function createLimiter(config: LimiterConfig): Limiter {
  return {
    cache: new LRUCache({ max: 10_000, ttl: config.windowMs }),
    config,
  };
}

export function consumeToken(limiter: Limiter, key: string): ConsumeResult {
  const now = Date.now();
  const entry = limiter.cache.get(key);
  if (!entry || entry.resetAt <= now) {
    limiter.cache.set(key, { count: 1, resetAt: now + limiter.config.windowMs });
    return { ok: true, remaining: limiter.config.max - 1 };
  }
  if (entry.count >= limiter.config.max) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { ok: true, remaining: limiter.config.max - entry.count };
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- rate-limit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts tests/lib/rate-limit.test.ts
git commit -m "feat(security): add in-memory token bucket rate limiter"
```

### Task 2.5: version-check.ts

**Files:**
- Create: `src/lib/version-check.ts`
- Test: `tests/lib/version-check.test.ts`

- [ ] **Step 1: Escribir test**

Crear `tests/lib/version-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseIfMatch, VersionMismatchError } from "@/lib/version-check";

describe("parseIfMatch", () => {
  it("returns null for missing header", () => {
    expect(parseIfMatch(null)).toBeNull();
    expect(parseIfMatch(undefined)).toBeNull();
  });

  it("parses 'v=N' format", () => {
    expect(parseIfMatch("v=3")).toBe(3);
    expect(parseIfMatch("v=999")).toBe(999);
  });

  it("returns null for invalid format", () => {
    expect(parseIfMatch("abc")).toBeNull();
    expect(parseIfMatch("v=abc")).toBeNull();
    expect(parseIfMatch("")).toBeNull();
  });
});

describe("VersionMismatchError", () => {
  it("has code CONFLICT and currentVersion", () => {
    const err = new VersionMismatchError(5);
    expect(err.code).toBe("CONFLICT");
    expect(err.currentVersion).toBe(5);
  });
});
```

- [ ] **Step 2: Correr y fallar**

```bash
npm test -- version-check
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar**

Crear `src/lib/version-check.ts`:

```ts
export function parseIfMatch(header: string | null | undefined): number | null {
  if (!header) return null;
  const match = header.match(/^v=(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export class VersionMismatchError extends Error {
  public code = "CONFLICT" as const;
  constructor(public currentVersion: number) {
    super(`version mismatch: current=${currentVersion}`);
  }
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- version-check
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/version-check.ts tests/lib/version-check.test.ts
git commit -m "feat(concurrency): add optimistic concurrency helpers"
```

### Task 2.6: logger.ts

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: Implementar logger**

Crear `src/lib/logger.ts`:

```ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { app: "avalon-tracker" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "body.password", "body.token"],
    remove: true,
  },
});

export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
```

- [ ] **Step 2: Verificar no rompe build**

```bash
npx tsc --noEmit 2>&1 | grep "logger" || echo "no logger errors"
```
Expected: "no logger errors".

- [ ] **Step 3: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat(observability): add pino logger"
```

### Task 2.7: api-error.ts

**Files:**
- Create: `src/lib/api-error.ts`

- [ ] **Step 1: Implementar**

Crear `src/lib/api-error.ts`:

```ts
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import crypto from "node:crypto";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_MEMBER"
  | "INSUFFICIENT_ROLE"
  | "CONFLICT"
  | "STALE_DEPENDENCY"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INTERNAL";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    [extra: string]: unknown;
  };
};

export function apiError(
  code: ApiErrorCode,
  status: number,
  message: string,
  extra?: Record<string, unknown>
): NextResponse<ApiErrorBody> {
  const requestId = `req_${crypto.randomBytes(6).toString("hex")}`;
  return NextResponse.json(
    { error: { code, message, requestId, ...extra } },
    { status }
  );
}

export function internalError(err: unknown): NextResponse<ApiErrorBody> {
  const requestId = `req_${crypto.randomBytes(6).toString("hex")}`;
  logger.error({ err, requestId }, "unhandled api error");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Error interno", requestId } },
    { status: 500 }
  );
}
```

- [ ] **Step 2: Verificar tsc**

```bash
npx tsc --noEmit 2>&1 | grep "api-error" || echo "ok"
```
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-error.ts
git commit -m "feat(api): add uniform error envelope"
```

---

## Fase 3: Vigil Bot client + mock

### Task 3.1: vigil-bot-client.ts — funciones base

**Files:**
- Create: `src/lib/vigil-bot-client.ts`
- Test: `tests/lib/vigil-bot-client.test.ts`

- [ ] **Step 1: Escribir tests (con fetch mock)**

Crear `tests/lib/vigil-bot-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchUserRoleFromBot, fetchGuildRoles, BotUnavailableError } from "@/lib/vigil-bot-client";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.VIGIL_BOT_API_URL = "http://mock-bot";
  process.env.VIGIL_BOT_SHARED_SECRET = "test-secret";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchUserRoleFromBot", () => {
  it("returns parsed body on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        discordRoleIds: ["r1", "r2"],
        computedAppRole: "EDITOR",
      }), { status: 200 })
    ) as typeof fetch;

    const r = await fetchUserRoleFromBot("g1", "u1");
    expect(r.discordRoleIds).toEqual(["r1", "r2"]);
    expect(r.computedAppRole).toBe("EDITOR");
  });

  it("throws BotUnavailableError on 5xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("oops", { status: 503 })
    ) as typeof fetch;
    await expect(fetchUserRoleFromBot("g1", "u1")).rejects.toBeInstanceOf(BotUnavailableError);
  });

  it("throws BotUnavailableError on network fail", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as typeof fetch;
    await expect(fetchUserRoleFromBot("g1", "u1")).rejects.toBeInstanceOf(BotUnavailableError);
  });

  it("returns null appRole when bot reports no mapping", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ discordRoleIds: [], computedAppRole: null }), { status: 200 })
    ) as typeof fetch;
    const r = await fetchUserRoleFromBot("g1", "u1");
    expect(r.computedAppRole).toBeNull();
  });
});

describe("fetchGuildRoles", () => {
  it("returns roles array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { id: "r1", name: "Admin", color: 16711680, position: 10 },
      ]), { status: 200 })
    ) as typeof fetch;
    const roles = await fetchGuildRoles("g1");
    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe("Admin");
  });
});
```

- [ ] **Step 2: Correr y fallar**

```bash
npm test -- vigil-bot-client
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar**

Crear `src/lib/vigil-bot-client.ts`:

```ts
import type { AppRole } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

export class BotUnavailableError extends Error {
  public code = "VIGIL_BOT_UNAVAILABLE" as const;
  constructor(public cause: unknown) {
    super("Vigil Bot unreachable");
  }
}

type UserRoleResponse = {
  discordRoleIds: string[];
  computedAppRole: AppRole | null;
};

type GuildRole = {
  id: string;
  name: string;
  color: number;
  position: number;
};

function botUrl(): string {
  const url = process.env.VIGIL_BOT_API_URL;
  if (!url) throw new BotUnavailableError(new Error("VIGIL_BOT_API_URL not set"));
  return url;
}

function authHeaders(): Record<string, string> {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) throw new BotUnavailableError(new Error("VIGIL_BOT_SHARED_SECRET not set"));
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

const DEFAULT_TIMEOUT_MS = 2000;

async function botFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${botUrl()}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new BotUnavailableError(new Error(`HTTP ${res.status}`));
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof BotUnavailableError) throw err;
    logger.warn({ err, path }, "vigil bot call failed");
    throw new BotUnavailableError(err);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUserRoleFromBot(
  guildId: string,
  discordId: string
): Promise<UserRoleResponse> {
  return botFetch<UserRoleResponse>(
    `/guilds/${encodeURIComponent(guildId)}/member/${encodeURIComponent(discordId)}/roles`
  );
}

export async function fetchGuildRoles(guildId: string): Promise<GuildRole[]> {
  return botFetch<GuildRole[]>(`/guilds/${encodeURIComponent(guildId)}/roles`);
}

export async function fetchGuildHealth(guildId: string): Promise<{ installed: boolean }> {
  try {
    return await botFetch<{ installed: boolean; gatewayConnected: boolean }>(
      `/guilds/${encodeURIComponent(guildId)}/health`
    );
  } catch {
    return { installed: false };
  }
}

export async function fetchUserClans(
  discordId: string
): Promise<Array<{ guildId: string; discordRoleIds: string[]; computedAppRole: AppRole | null }>> {
  return botFetch(`/users/${encodeURIComponent(discordId)}/clans`);
}

export async function postGuildMessage(
  guildId: string,
  channelId: string,
  payload: { content?: string; embed?: unknown }
): Promise<void> {
  await botFetch(`/guilds/${encodeURIComponent(guildId)}/message`, {
    method: "POST",
    body: JSON.stringify({ channelId, ...payload }),
  });
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- vigil-bot-client
```
Expected: PASS todos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vigil-bot-client.ts tests/lib/vigil-bot-client.test.ts
git commit -m "feat(vigil-bot): add HTTP client with timeouts"
```

### Task 3.2: Mock Express server para desarrollo local

**Files:**
- Create: `scripts/mock-vigil-bot.ts`

- [ ] **Step 1: Implementar mock**

Crear `scripts/mock-vigil-bot.ts`:

```ts
import express from "express";
import "dotenv/config";

const PORT = 4000;
const SECRET = process.env.VIGIL_BOT_SHARED_SECRET ?? "test-secret";

const fakeGuild = {
  id: "111111111111111111",
  name: "Fake Guild",
  icon: null,
  roles: [
    { id: "r_admin",  name: "Admin",       color: 15158332, position: 10 },
    { id: "r_editor", name: "Officer",     color: 3447003,  position: 8  },
    { id: "r_contrib",name: "Member",      color: 2123412,  position: 5  },
    { id: "r_viewer", name: "Recruit",     color: 9807270,  position: 2  },
  ],
};

const fakeMembers: Record<string, { nickname: string | null; roles: string[] }> = {
  DISCORD_USER_1: { nickname: "Tester1", roles: ["r_admin", "r_contrib"] },
  DISCORD_USER_2: { nickname: null,      roles: ["r_editor"] },
  DISCORD_USER_3: { nickname: "Rookie",  roles: ["r_viewer"] },
};

const mappings: Record<string, "ADMIN" | "EDITOR" | "CONTRIBUTOR" | "VIEWER"> = {
  r_admin:   "ADMIN",
  r_editor:  "EDITOR",
  r_contrib: "CONTRIBUTOR",
  r_viewer:  "VIEWER",
};

const HIERARCHY = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, ADMIN: 4 };
function highest(roleIds: string[]) {
  const apps = roleIds.map(r => mappings[r]).filter(Boolean);
  if (apps.length === 0) return null;
  return apps.reduce((m, r) => HIERARCHY[r] > HIERARCHY[m] ? r : m);
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${SECRET}`) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/guilds/:guildId/health", (req, res) => {
  if (req.params.guildId !== fakeGuild.id) return res.status(404).end();
  res.json({ installed: true, gatewayConnected: true });
});

app.get("/guilds/:guildId/roles", (req, res) => {
  if (req.params.guildId !== fakeGuild.id) return res.status(404).end();
  res.json(fakeGuild.roles);
});

app.get("/guilds/:guildId/member/:discordId/roles", (req, res) => {
  if (req.params.guildId !== fakeGuild.id) return res.status(404).end();
  const m = fakeMembers[req.params.discordId];
  if (!m) return res.json({ discordRoleIds: [], computedAppRole: null });
  res.json({ discordRoleIds: m.roles, computedAppRole: highest(m.roles) });
});

app.get("/users/:discordId/clans", (req, res) => {
  const m = fakeMembers[req.params.discordId];
  if (!m) return res.json([]);
  res.json([{ guildId: fakeGuild.id, discordRoleIds: m.roles, computedAppRole: highest(m.roles) }]);
});

app.post("/guilds/:guildId/message", (req, res) => {
  console.log("[mock-bot] message:", req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[mock-bot] listening on http://localhost:${PORT}`);
  console.log("[mock-bot] fake guild id:", fakeGuild.id);
  console.log("[mock-bot] known discord user ids:", Object.keys(fakeMembers).join(", "));
});
```

- [ ] **Step 2: Añadir script a package.json**

En `package.json#scripts` añadir:

```json
"mock-bot": "tsx scripts/mock-vigil-bot.ts"
```

- [ ] **Step 3: Añadir express a deps (si no está)**

```bash
npm install express
npm install -D @types/express
```

- [ ] **Step 4: Verificar arranque**

```bash
npm run mock-bot &
sleep 2
curl -H "Authorization: Bearer test-secret" http://localhost:4000/guilds/111111111111111111/health
```
Expected: `{"installed":true,"gatewayConnected":true}`

Matar proceso: `kill %1` o `lsof -ti:4000 | xargs kill`.

- [ ] **Step 5: Commit**

```bash
git add scripts/mock-vigil-bot.ts package.json package-lock.json
git commit -m "feat(dev): add mock Vigil Bot Express server"
```

---

## Fase 4: Discord OAuth + middleware

### Task 4.1: auth.config.ts Edge-safe

**Files:**
- Modify: `src/lib/auth.config.ts` (reescritura)

- [ ] **Step 1: Reescribir auth.config.ts**

Reemplazar contenido de `src/lib/auth.config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";

export const authConfig = {
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  pages: { signIn: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 2: Verificar no importa Prisma (debe ser Edge-safe)**

Run: `grep -n "prisma\|@prisma\|PrismaClient" src/lib/auth.config.ts`
Expected: sin output (0 matches).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.config.ts
git commit -m "feat(auth): Discord provider in Edge-safe config"
```

### Task 4.2: auth.ts — callbacks con Prisma + Vigil Bot

**Files:**
- Modify: `src/lib/auth.ts` (reescritura)

- [ ] **Step 1: Reescribir auth.ts**

Reemplazar contenido de `src/lib/auth.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";
import { fetchUserClans } from "@/lib/vigil-bot-client";
import { logger } from "@/lib/logger";

function superAdminIds(): string[] {
  return (process.env.SUPER_ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, profile, account }) {
      if (account?.provider !== "discord") return false;
      const discordId = account.providerAccountId;
      const username = (profile as { username?: string })?.username ?? user.name ?? "unknown";
      const avatar = (profile as { avatar?: string })?.avatar ?? null;
      const globalNickname = (profile as { global_name?: string })?.global_name ?? null;

      const isSuperAdmin = superAdminIds().includes(discordId);

      await prisma.user.upsert({
        where: { discordId },
        create: {
          discordId,
          discordUsername: username,
          discordAvatar: avatar,
          globalNickname,
          email: user.email ?? `${discordId}@discord.local`,
          image: user.image ?? null,
          isSuperAdmin,
        },
        update: {
          discordUsername: username,
          discordAvatar: avatar,
          globalNickname,
          email: user.email ?? `${discordId}@discord.local`,
          image: user.image ?? null,
          isSuperAdmin,
        },
      });
      return true;
    },

    async jwt({ token, account, profile, trigger }) {
      if (account?.provider === "discord") {
        token.discordId = account.providerAccountId;
      }
      if (!token.discordId && typeof token.sub === "string") {
        token.discordId = token.sub;
      }
      if (!token.id && token.discordId) {
        const u = await prisma.user.findUnique({ where: { discordId: token.discordId as string } });
        if (u) {
          token.id = u.id;
          token.isSuperAdmin = u.isSuperAdmin;
        }
      }

      if (trigger === "signIn" && token.discordId) {
        try {
          const clans = await fetchUserClans(token.discordId as string);
          for (const c of clans) {
            const clan = await prisma.clan.findUnique({ where: { discordGuildId: c.guildId } });
            if (!clan || typeof token.id !== "string") continue;
            await prisma.clanMember.upsert({
              where: { userId_clanId: { userId: token.id, clanId: clan.id } },
              create: {
                userId: token.id,
                clanId: clan.id,
                appRole: c.computedAppRole,
                roleSource: `discord:${c.discordRoleIds.join(",")}`,
                lastSyncAt: new Date(),
              },
              update: {
                appRole: c.computedAppRole,
                roleSource: `discord:${c.discordRoleIds.join(",")}`,
                lastSyncAt: new Date(),
              },
            });
          }
        } catch (err) {
          logger.warn({ err }, "vigil bot unavailable during signIn; user logged in without clan sync");
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.discordId === "string") (session.user as Record<string, unknown>).discordId = token.discordId;
      (session.user as Record<string, unknown>).isSuperAdmin = Boolean(token.isSuperAdmin);
      return session;
    },
  },
});
```

- [ ] **Step 2: Actualizar tipos de session**

Reemplazar contenido de `src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordId: string;
      isSuperAdmin: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    discordId?: string;
    isSuperAdmin?: boolean;
  }
}
```

- [ ] **Step 3: Verificar tsc**

```bash
npx tsc --noEmit 2>&1 | tail -30
```
Expected: errores remanentes solo en archivos que aún no migramos (rutas de API viejas). Ninguno en `src/lib/auth*` ni `src/types/next-auth.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts src/types/next-auth.d.ts
git commit -m "feat(auth): Discord callbacks with clan sync via Vigil Bot"
```

### Task 4.3: middleware.ts

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Reescribir middleware**

Reemplazar `src/middleware.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  const isAuth = path.startsWith("/clan") || path.startsWith("/admin") || path.startsWith("/profile") || path.startsWith("/dashboard");

  if (isAuth && !session?.user) {
    return Response.redirect(new URL("/", nextUrl));
  }

  if (path.startsWith("/admin")) {
    const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
    if (!isSuperAdmin) {
      return Response.redirect(new URL("/dashboard", nextUrl));
    }
  }
});

export const config = {
  matcher: ["/clan/:path*", "/admin/:path*", "/profile/:path*", "/dashboard/:path*"],
};
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit src/middleware.ts 2>&1 || true
```
Expected: no errores (o solo warnings menores).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): middleware gate auth + superadmin"
```

### Task 4.4: Configurar avatar Discord en next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Reescribir next.config.ts**

Reemplazar `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Commit**

```bash
git add next.config.ts
git commit -m "chore(next): add security headers + Discord CDN remotePatterns"
```

---

## Fase 5: API — clanes y role mappings

### Task 5.1: Eliminar rutas legacy

**Files:**
- Delete: `src/app/api/invite-codes/route.ts`
- Delete: `src/app/api/profile/code/route.ts` (si existe)
- Delete: `src/app/api/external/` (entera)
- Delete: `src/lib/invite-codes.ts`

- [ ] **Step 1: Eliminar**

```bash
rm -rf src/app/api/invite-codes
rm -rf src/app/api/profile/code
rm -rf src/app/api/external
rm -f src/lib/invite-codes.ts
```

- [ ] **Step 2: Verificar no roto**

```bash
grep -r "invite-codes\|personalCode\|resolveInviteCode" src/ scripts/ tests/ 2>/dev/null || echo "ok"
```
Expected: "ok" o solo matches en plans/specs (no en código).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove legacy invite-codes and external API"
```

### Task 5.2: POST /api/clans — crear clan (valida Vigil Bot)

**Files:**
- Modify: `src/app/api/clans/route.ts`

- [ ] **Step 1: Reescribir route.ts**

Reemplazar `src/app/api/clans/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth } from "@/lib/vigil-bot-client";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(3).max(40),
  discordGuildId: z.string().regex(/^\d{17,20}$/),
  discordGuildName: z.string().min(1).max(100),
  discordGuildIcon: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: session.user.id, appRole: { not: null } } } },
    include: {
      members: { where: { userId: session.user.id }, select: { appRole: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    clans.map((c) => ({
      id: c.id,
      name: c.name,
      discordGuildName: c.discordGuildName,
      discordGuildIcon: c.discordGuildIcon,
      myRole: c.members[0]?.appRole ?? null,
      memberCount: undefined,
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", 400, "Datos inválidos", {
        issues: parsed.error.issues,
      });
    }

    const health = await fetchGuildHealth(parsed.data.discordGuildId);
    if (!health.installed) {
      return apiError("VALIDATION_ERROR", 400,
        "Vigil Bot no está instalado en este guild. Instálalo antes de crear el clan.");
    }

    const clan = await prisma.clan.create({
      data: {
        name: parsed.data.name,
        discordGuildId: parsed.data.discordGuildId,
        discordGuildName: parsed.data.discordGuildName,
        discordGuildIcon: parsed.data.discordGuildIcon ?? null,
        botInstalled: true,
        createdById: session.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        clanId: clan.id,
        userId: session.user.id,
        action: "CLAN_CREATE",
        details: { name: clan.name, guildId: clan.discordGuildId },
      },
    });

    return NextResponse.json(clan, { status: 201 });
  } catch (err) {
    logger.error({ err }, "POST /api/clans failed");
    return internalError(err);
  }
}
```

- [ ] **Step 2: Probar manualmente**

Levantar dev + mock bot en paralelo:

```bash
npm run mock-bot &
npm run dev &
```

Loguear via Discord OAuth (fuera del scope del test aquí, se prueba en integración).

Probar POST con fetch autenticada o Postman:

```
POST http://localhost:3000/api/clans
Cookie: authjs.session-token=<token>
{
  "name": "Test Clan",
  "discordGuildId": "111111111111111111",
  "discordGuildName": "Fake Guild"
}
```
Expected: 201 con el clan creado.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clans/route.ts
git commit -m "feat(api): POST /api/clans requires Vigil Bot presence"
```

### Task 5.3: GET/PATCH/DELETE /api/clans/[clanId]

**Files:**
- Modify: `src/app/api/clans/[clanId]/route.ts`

- [ ] **Step 1: Reescribir**

Reemplazar `src/app/api/clans/[clanId]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const patchSchema = z.object({
  name: z.string().min(3).max(40).optional(),
  discordWebhookUrl: z.string().url().nullable().optional(),
  anchorZoneId: z.number().int().positive().nullable().optional(),
}).strict();

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    include: { _count: { select: { members: true, routes: true } } },
  });
  if (!clan) return apiError("NOT_FOUND", 404, "Clan no encontrado");
  return NextResponse.json(clan);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const clan = await prisma.clan.update({
    where: { id: clanId },
    data: parsed.data,
  });

  await prisma.auditLog.create({
    data: {
      clanId,
      userId: session.user.id,
      action: "SETTINGS_CHANGE",
      details: parsed.data as Record<string, unknown>,
    },
  });

  return NextResponse.json(clan);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;

  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  await prisma.clan.delete({ where: { id: clanId } });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clans/[clanId]/route.ts
git commit -m "feat(api): GET/PATCH/DELETE /api/clans/[clanId]"
```

### Task 5.4: Role mappings — listar/crear/borrar

**Files:**
- Create: `src/app/api/clans/[clanId]/role-mappings/route.ts`
- Create: `src/app/api/clans/[clanId]/role-mappings/[id]/route.ts`

- [ ] **Step 1: Crear `role-mappings/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError, invalidateRoleCache } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const upsertSchema = z.object({
  discordRoleId: z.string().regex(/^\d{17,20}$/),
  discordRoleName: z.string().min(1).max(100),
  appRole: z.enum(["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"]),
});

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }
  const mappings = await prisma.clanRoleMapping.findMany({ where: { clanId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(mappings);
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const mapping = await prisma.clanRoleMapping.upsert({
    where: { clanId_discordRoleId: { clanId, discordRoleId: parsed.data.discordRoleId } },
    create: { clanId, ...parsed.data },
    update: { appRole: parsed.data.appRole, discordRoleName: parsed.data.discordRoleName },
  });

  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, action: "ROLE_MAPPING_CHANGE", details: parsed.data as Record<string, unknown> },
  });

  const members = await prisma.clanMember.findMany({ where: { clanId }, select: { userId: true } });
  for (const m of members) invalidateRoleCache(m.userId, clanId);

  return NextResponse.json(mapping, { status: 201 });
}
```

- [ ] **Step 2: Crear `role-mappings/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError, invalidateRoleCache } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string; id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, id } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const mappingId = Number(id);
  if (!Number.isInteger(mappingId)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const mapping = await prisma.clanRoleMapping.findFirst({ where: { id: mappingId, clanId } });
  if (!mapping) return apiError("NOT_FOUND", 404, "Mapping no encontrado");

  await prisma.clanRoleMapping.delete({ where: { id: mappingId } });

  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, action: "ROLE_MAPPING_CHANGE", details: { deleted: mapping.discordRoleId } },
  });

  const members = await prisma.clanMember.findMany({ where: { clanId }, select: { userId: true } });
  for (const m of members) invalidateRoleCache(m.userId, clanId);

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clans/[clanId]/role-mappings
git commit -m "feat(api): role-mappings CRUD"
```

### Task 5.5: Proxy discord-roles (a Vigil Bot)

**Files:**
- Create: `src/app/api/clans/[clanId]/discord-roles/route.ts`

- [ ] **Step 1: Crear endpoint proxy**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { fetchGuildRoles, BotUnavailableError } from "@/lib/vigil-bot-client";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { discordGuildId: true } });
  if (!clan) return apiError("NOT_FOUND", 404, "Clan no encontrado");

  try {
    const roles = await fetchGuildRoles(clan.discordGuildId);
    return NextResponse.json(roles);
  } catch (e) {
    if (e instanceof BotUnavailableError) {
      return apiError("STALE_DEPENDENCY", 503, "Vigil Bot no responde");
    }
    return internalError(e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clans/[clanId]/discord-roles/route.ts
git commit -m "feat(api): discord-roles proxy to Vigil Bot"
```

### Task 5.6: Members list + displayName override

**Files:**
- Modify: `src/app/api/clans/[clanId]/members/route.ts` (reescritura)
- Modify: `src/app/api/clans/[clanId]/members/[memberId]/route.ts` (reescritura)

- [ ] **Step 1: Reescribir members/route.ts (solo GET)**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const members = await prisma.clanMember.findMany({
    where: { clanId },
    include: {
      user: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true, discordId: true } },
    },
    orderBy: [{ appRole: "desc" }, { joinedAt: "asc" }],
  });

  return NextResponse.json(members);
}
```

- [ ] **Step 2: Reescribir `members/[memberId]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const patchSchema = z.object({
  displayName: z.string().min(1).max(40).nullable(),
});

type RouteParams = { params: Promise<{ clanId: string; memberId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, memberId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const memberIdInt = Number(memberId);
  if (!Number.isInteger(memberIdInt)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const member = await prisma.clanMember.findFirst({ where: { id: memberIdInt, clanId } });
  if (!member) return apiError("NOT_FOUND", 404, "Miembro no encontrado");

  await prisma.user.update({ where: { id: member.userId }, data: { displayName: parsed.data.displayName } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clans/[clanId]/members
git commit -m "feat(api): members list + displayName override"
```

---

## Fase 6: API — routes y hops

### Task 6.1: GET/POST /api/clans/[clanId]/routes

**Files:**
- Modify: `src/app/api/clans/[clanId]/routes/route.ts` (reescritura)

- [ ] **Step 1: Reescribir**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const hopSchema = z.object({
  fromZone: z.string().min(1),
  toZone: z.string().min(1),
  portalSize: z.union([z.literal(7), z.literal(20), z.literal(40)]),
  expiresAt: z.string().datetime(),
});

const createSchema = z.object({
  hops: z.array(hopSchema).min(1).max(12),
  notes: z.string().max(200).optional(),
}).refine((d) => d.hops.every((h, i) => i === 0 || h.fromZone === d.hops[i - 1].toZone), {
  message: "Cadena no continua",
  path: ["hops"],
});

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  const status = url.searchParams.get("status") as "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL" | null;

  const where: Record<string, unknown> = { clanId };
  if (status && status !== "ALL") where.status = status;
  else if (!status) where.status = "ACTIVE";
  if (since) where.updatedAt = { gt: new Date(since) };

  const routes = await prisma.route.findMany({
    where,
    include: {
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const now = new Date().toISOString();
  return NextResponse.json({ routes, now });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const zoneNames = new Set<string>();
  for (const h of parsed.data.hops) { zoneNames.add(h.fromZone); zoneNames.add(h.toZone); }
  const zones = await prisma.zone.findMany({ where: { name: { in: [...zoneNames] } } });
  const byName = new Map(zones.map((z) => [z.name, z.id]));
  for (const n of zoneNames) if (!byName.has(n)) {
    return apiError("VALIDATION_ERROR", 400, `Zona desconocida: ${n}`);
  }

  const route = await prisma.route.create({
    data: {
      clanId,
      createdById: session.user.id,
      notes: parsed.data.notes ?? null,
      hops: {
        create: parsed.data.hops.map((h, i) => ({
          order: i,
          fromZoneId: byName.get(h.fromZone)!,
          toZoneId: byName.get(h.toZone)!,
          portalSize: h.portalSize,
          expiresAt: new Date(h.expiresAt),
        })),
      },
    },
    include: { hops: { orderBy: { order: "asc" } } },
  });

  await prisma.auditLog.create({
    data: {
      clanId, userId: session.user.id, action: "ROUTE_CREATE", targetId: route.id,
      details: { hopCount: parsed.data.hops.length },
    },
  });

  return NextResponse.json(route, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clans/[clanId]/routes/route.ts
git commit -m "feat(api): routes list (with ?since) and create"
```

### Task 6.2: PATCH/DELETE /api/clans/[clanId]/routes/[routeId]

**Files:**
- Modify: `src/app/api/clans/[clanId]/routes/[routeId]/route.ts`

- [ ] **Step 1: Reescribir**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { parseIfMatch, VersionMismatchError } from "@/lib/version-check";

const patchSchema = z.object({
  notes: z.string().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
}).strict();

type RouteParams = { params: Promise<{ clanId: string; routeId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "VIEWER", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const route = await prisma.route.findFirst({
    where: { id: routeId, clanId },
    include: { hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } } },
  });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");
  return NextResponse.json(route);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const wantsDisable = parsed.data.status === "DISABLED";
  const minRole = wantsDisable ? "CONTRIBUTOR" : "CONTRIBUTOR";
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, minRole, "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const current = await prisma.route.findFirst({ where: { id: routeId, clanId } });
  if (!current) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  const ifMatch = parseIfMatch(request.headers.get("if-match"));
  if (ifMatch !== null && ifMatch !== current.version) {
    return apiError("CONFLICT", 409, "Alguien ya editó esta ruta; recarga", { currentVersion: current.version });
  }

  try {
    const updated = await prisma.route.update({
      where: { id: routeId },
      data: {
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
        status: parsed.data.status,
        disabledAt: wantsDisable ? new Date() : null,
        disabledById: wantsDisable ? session.user.id : null,
        version: { increment: 1 },
      },
    });
    await prisma.auditLog.create({
      data: {
        clanId, userId: session.user.id, targetId: routeId,
        action: wantsDisable ? "ROUTE_DISABLE" : "ROUTE_UPDATE",
        details: parsed.data as Record<string, unknown>,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof VersionMismatchError) return apiError("CONFLICT", 409, "version mismatch", { currentVersion: err.currentVersion });
    return internalError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }
  const route = await prisma.route.findFirst({ where: { id: routeId, clanId } });
  if (!route) return apiError("NOT_FOUND", 404, "Ruta no encontrada");

  await prisma.route.delete({ where: { id: routeId } });
  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, targetId: routeId, action: "ROUTE_DELETE" },
  });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clans/[clanId]/routes/[routeId]/route.ts
git commit -m "feat(api): route PATCH (with If-Match) and DELETE"
```

### Task 6.3: Hops endpoint — PATCH/DELETE

**Files:**
- Create: `src/app/api/clans/[clanId]/routes/[routeId]/hops/[hopId]/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const patchSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "COLLAPSED", "WATCHED"]).optional(),
  statusNote: z.string().max(100).nullable().optional(),
}).strict();

type RouteParams = { params: Promise<{ clanId: string; routeId: string; hopId: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId, hopId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "CONTRIBUTOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const hopIdInt = Number(hopId);
  if (!Number.isInteger(hopIdInt)) return apiError("VALIDATION_ERROR", 400, "hopId inválido");

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });

  const hop = await prisma.routeHop.findFirst({ where: { id: hopIdInt, routeId }, include: { route: true } });
  if (!hop || hop.route.clanId !== clanId) return apiError("NOT_FOUND", 404, "Hop no encontrado");

  const updated = await prisma.routeHop.update({
    where: { id: hopIdInt },
    data: {
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      status: parsed.data.status,
      statusNote: parsed.data.statusNote === undefined ? undefined : parsed.data.statusNote,
      statusSetById: parsed.data.status !== undefined ? session.user.id : undefined,
      statusSetAt: parsed.data.status !== undefined ? new Date() : undefined,
    },
  });

  await prisma.route.update({ where: { id: routeId }, data: { version: { increment: 1 } } });

  await prisma.auditLog.create({
    data: {
      clanId, userId: session.user.id, targetId: String(hopIdInt),
      action: parsed.data.status !== undefined ? "HOP_STATUS_CHANGED" : "HOP_EXTENDED",
      details: parsed.data as Record<string, unknown>,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId, routeId, hopId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "EDITOR", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const hopIdInt = Number(hopId);
  if (!Number.isInteger(hopIdInt)) return apiError("VALIDATION_ERROR", 400, "hopId inválido");

  const hop = await prisma.routeHop.findFirst({ where: { id: hopIdInt, routeId }, include: { route: true } });
  if (!hop || hop.route.clanId !== clanId) return apiError("NOT_FOUND", 404, "Hop no encontrado");

  await prisma.routeHop.delete({ where: { id: hopIdInt } });
  await prisma.route.update({ where: { id: routeId }, data: { version: { increment: 1 } } });
  await prisma.auditLog.create({
    data: { clanId, userId: session.user.id, targetId: String(hopIdInt), action: "HOP_DELETE" },
  });

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clans/[clanId]/routes/[routeId]/hops
git commit -m "feat(api): hop PATCH/DELETE"
```

---

## Fase 7: API — zonas + pathfinding + seeds

### Task 7.1: Mejorar seed de zonas

**Files:**
- Create: `scripts/seed-zones.ts`

- [ ] **Step 1: Crear script**

```ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const exists = await prisma.zone.count();
  if (exists > 0) {
    console.log(`[seed-zones] ya pobladas (${exists} zones), skip`);
    return;
  }

  const avalon = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/avalon-zones.json"), "utf8")) as Array<{
    name: string; tier?: number; resources?: unknown; chests?: unknown; dungeons?: unknown; isRest?: boolean; hasHideout?: boolean;
  }>;
  const world = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/data/world-zones.json"), "utf8")) as Array<{
    name: string; type: "ROYAL" | "OUTLANDS"; tier?: number; isCapital?: boolean;
  }>;

  let n = 0;
  for (const z of avalon) {
    await prisma.zone.create({
      data: {
        name: z.name,
        type: "AVALON",
        tier: z.tier ?? null,
        hasHideout: Boolean(z.hasHideout),
        isRest: Boolean(z.isRest),
        rawData: { resources: z.resources, chests: z.chests, dungeons: z.dungeons },
      },
    });
    if (++n % 100 === 0) console.log(`[seed-zones] ${n} avalon...`);
  }
  for (const z of world) {
    await prisma.zone.create({
      data: {
        name: z.name,
        type: z.type,
        tier: z.tier ?? null,
        isCapital: Boolean(z.isCapital),
      },
    });
    if (++n % 100 === 0) console.log(`[seed-zones] ${n} total...`);
  }
  console.log(`[seed-zones] done, ${n} zones`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Añadir script**

En `package.json#scripts`:

```json
"seed:zones": "tsx scripts/seed-zones.ts"
```

- [ ] **Step 3: Ejecutar contra BD dev**

```bash
npm run seed:zones
```
Expected: "[seed-zones] done, N zones". Si los JSON no tienen `isHideout`/`isRest`, esos booleans quedan false — se completarán después.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-zones.ts package.json
git commit -m "feat(seed): seed-zones idempotent"
```

### Task 7.2: Importar world graph

**Files:**
- Create: `scripts/import-world-graph.ts`

- [ ] **Step 1: Crear script (con fallback si JSON vacío)**

```ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type EdgeInput = { from: string; to: string; kind: "ROYAL_ROAD" | "AVALON_STATIC" | "AVALON_TO_ROYAL" | "OUTLANDS_ROAD" };

async function main() {
  const file = path.join(process.cwd(), "src/data/world-graph.json");
  if (!fs.existsSync(file)) { console.log("[world-graph] no file, skip"); return; }
  const raw = fs.readFileSync(file, "utf8").trim();
  if (!raw || raw === "{}" || raw === "[]") { console.log("[world-graph] empty, skip"); return; }

  const existing = await prisma.zoneConnection.count();
  if (existing > 0) { console.log(`[world-graph] already populated (${existing}), skip`); return; }

  const data = JSON.parse(raw) as { connections: EdgeInput[] };
  const zones = await prisma.zone.findMany({ select: { id: true, name: true } });
  const byName = new Map(zones.map((z) => [z.name, z.id]));

  let inserted = 0, skipped = 0;
  for (const c of data.connections ?? []) {
    const fromId = byName.get(c.from);
    const toId = byName.get(c.to);
    if (!fromId || !toId) { skipped++; continue; }
    try {
      await prisma.zoneConnection.create({ data: { fromZoneId: fromId, toZoneId: toId, connectionType: c.kind } });
      inserted++;
    } catch {
      skipped++;
    }
  }
  console.log(`[world-graph] ${inserted} inserted, ${skipped} skipped`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Añadir script**

En `package.json#scripts`:

```json
"seed:graph": "tsx scripts/import-world-graph.ts"
```

- [ ] **Step 3: Ejecutar**

```bash
npm run seed:graph
```
Expected: "[world-graph] empty, skip" si el JSON sigue vacío. No falla.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-world-graph.ts package.json
git commit -m "feat(seed): import-world-graph script"
```

### Task 7.3: Precompute routing (BFS)

**Files:**
- Create: `scripts/precompute-routing.ts`
- Test: `scripts/__tests__/precompute-routing.test.ts`

- [ ] **Step 1: Escribir test unitario del BFS (función pura)**

Crear `scripts/__tests__/precompute-routing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bfsToTarget } from "../precompute-routing";

describe("bfsToTarget", () => {
  const adj = new Map<number, number[]>([
    [1, [2]],
    [2, [1, 3]],
    [3, [2, 4]],
    [4, [3]],
  ]);
  it("finds direct target", () => {
    expect(bfsToTarget(1, new Set([2]), adj)).toEqual({ targetId: 2, hops: 1 });
  });
  it("finds distant target", () => {
    expect(bfsToTarget(1, new Set([4]), adj)).toEqual({ targetId: 4, hops: 3 });
  });
  it("returns null if unreachable", () => {
    expect(bfsToTarget(1, new Set([999]), adj)).toBeNull();
  });
  it("excludes start from matches", () => {
    expect(bfsToTarget(1, new Set([1]), adj)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y fallar**

```bash
npm test -- precompute
```
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implementar**

Crear `scripts/precompute-routing.ts`:

```ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function bfsToTarget(
  start: number,
  targets: Set<number>,
  adj: Map<number, number[]>
): { targetId: number; hops: number } | null {
  const queue: Array<[number, number]> = [[start, 0]];
  const visited = new Set([start]);
  while (queue.length) {
    const [current, hops] = queue.shift()!;
    if (targets.has(current) && current !== start) return { targetId: current, hops };
    for (const next of adj.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, hops + 1]);
      }
    }
  }
  return null;
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

  const existing = await prisma.zoneRouting.count();
  const connCount = await prisma.zoneConnection.count();
  if (existing > 0) { console.log(`[routing] already populated (${existing}), skip`); await prisma.$disconnect(); return; }
  if (connCount === 0) { console.log("[routing] no connections, skip"); await prisma.$disconnect(); return; }

  const conns = await prisma.zoneConnection.findMany({ select: { fromZoneId: true, toZoneId: true } });
  const adj = new Map<number, number[]>();
  for (const c of conns) {
    if (!adj.has(c.fromZoneId)) adj.set(c.fromZoneId, []);
    if (!adj.has(c.toZoneId))   adj.set(c.toZoneId, []);
    adj.get(c.fromZoneId)!.push(c.toZoneId);
    adj.get(c.toZoneId)!.push(c.fromZoneId);
  }

  const royals = new Set((await prisma.zone.findMany({ where: { type: "ROYAL" }, select: { id: true } })).map((z) => z.id));
  const rests = new Set((await prisma.zone.findMany({ where: { type: "AVALON", isRest: true }, select: { id: true } })).map((z) => z.id));
  const avalons = await prisma.zone.findMany({ where: { type: "AVALON" }, select: { id: true } });

  const now = new Date();
  let n = 0;
  for (const z of avalons) {
    const r = bfsToTarget(z.id, royals, adj);
    const rest = bfsToTarget(z.id, rests, adj);
    await prisma.zoneRouting.create({
      data: {
        zoneId: z.id,
        nearestRoyalZoneId: r?.targetId ?? null,
        hopsToRoyal: r?.hops ?? null,
        nearestRestZoneId: rest?.targetId ?? null,
        hopsToRest: rest?.hops ?? null,
        computedAt: now,
      },
    });
    if (++n % 200 === 0) console.log(`[routing] ${n}/${avalons.length}`);
  }
  console.log(`[routing] done, ${n} zones`);
  await prisma.$disconnect();
}

if (process.env.VITEST !== "true" && process.argv[1]?.includes("precompute-routing")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Correr tests**

```bash
npm test -- precompute
```
Expected: PASS.

- [ ] **Step 5: Ejecutar script (sin world graph poblado, debe skip limpio)**

```bash
npm run precompute || true
```
En `package.json#scripts` añadir:

```json
"precompute": "tsx scripts/precompute-routing.ts"
```

Ejecutar: `npm run precompute`. Expected: "[routing] no connections, skip".

- [ ] **Step 6: Commit**

```bash
git add scripts/precompute-routing.ts scripts/__tests__/precompute-routing.test.ts package.json
git commit -m "feat(seed): precompute-routing BFS script + tests"
```

### Task 7.4: GET /api/zones (autocomplete mejorado)

**Files:**
- Modify: `src/app/api/zones/route.ts`

- [ ] **Step 1: Reescribir**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json([]);

  const zones = await prisma.zone.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 20,
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true },
  });
  return NextResponse.json(zones);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/zones/route.ts
git commit -m "feat(api): zones autocomplete with tier/HO/rest badges"
```

### Task 7.5: GET /api/zones/[zoneId] y /routing

**Files:**
- Create: `src/app/api/zones/[zoneId]/route.ts`
- Create: `src/app/api/zones/[zoneId]/routing/route.ts`

- [ ] **Step 1: Crear detalle**

```ts
// src/app/api/zones/[zoneId]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ zoneId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { zoneId } = await params;
  const id = Number(zoneId);
  if (!Number.isInteger(id)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const zone = await prisma.zone.findUnique({ where: { id } });
  if (!zone) return apiError("NOT_FOUND", 404, "Zona no encontrada");
  return NextResponse.json(zone);
}
```

- [ ] **Step 2: Crear routing**

```ts
// src/app/api/zones/[zoneId]/routing/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ zoneId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { zoneId } = await params;
  const id = Number(zoneId);
  if (!Number.isInteger(id)) return apiError("VALIDATION_ERROR", 400, "ID inválido");

  const r = await prisma.zoneRouting.findUnique({
    where: { zoneId: id },
    include: { nearestRoyal: true, nearestRest: true },
  });
  if (!r) return NextResponse.json({ nearestRoyal: null, nearestRest: null });
  return NextResponse.json({
    nearestRoyal: r.nearestRoyal ? { zone: r.nearestRoyal, hops: r.hopsToRoyal } : null,
    nearestRest:  r.nearestRest  ? { zone: r.nearestRest,  hops: r.hopsToRest  } : null,
    computedAt: r.computedAt,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/zones/[zoneId]
git commit -m "feat(api): zone detail + routing endpoints"
```

---

## Fase 8: API — audit + webhook-test + me

### Task 8.1: Audit con bypass super admin

**Files:**
- Modify: `src/lib/audit.ts` (reescritura)
- Modify: `src/app/api/clans/[clanId]/audit/route.ts`

- [ ] **Step 1: Reescribir audit.ts**

```ts
import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "CLAN_CREATE" | "CLAN_UPDATE" | "CLAN_DELETE"
  | "MEMBER_ROLE_SYNCED" | "MEMBER_LEFT"
  | "ROUTE_CREATE" | "ROUTE_UPDATE" | "ROUTE_DISABLE" | "ROUTE_DELETE"
  | "HOP_STATUS_CHANGED" | "HOP_EXTENDED" | "HOP_DELETE"
  | "SETTINGS_CHANGE" | "ROLE_MAPPING_CHANGE" | "WEBHOOK_UPDATE"
  | "DISCORD_LOGIN_FIRST";

export async function logAudit(
  clanId: string,
  userId: string,
  action: AuditAction,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (user?.isSuperAdmin) {
    const member = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { appRole: true },
    });
    if (!member || member.appRole === null) {
      return;
    }
  }
  await prisma.auditLog.create({
    data: { clanId, userId, action, targetId: targetId ?? null, details: details ?? undefined },
  });
}
```

- [ ] **Step 2: Reescribir audit/route.ts**

```ts
// src/app/api/clans/[clanId]/audit/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "GET");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin acceso", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { clanId },
      include: { user: { select: { id: true, discordUsername: true, displayName: true, globalNickname: true } } },
      orderBy: { createdAt: "desc" },
      skip, take: limit,
    }),
    prisma.auditLog.count({ where: { clanId } }),
  ]);

  return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit.ts src/app/api/clans/[clanId]/audit/route.ts
git commit -m "feat(audit): super admin silent bypass + cleaner GET"
```

### Task 8.2: Webhook-test endpoint

**Files:**
- Create: `src/app/api/clans/[clanId]/webhook-test/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRoleOrSuperAdminRead, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

type RouteParams = { params: Promise<{ clanId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { clanId } = await params;
  try {
    await requireRoleOrSuperAdminRead(session.user.id, clanId, "ADMIN", "WRITE");
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Sin permisos", e.extra);
    return internalError(e);
  }

  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { discordWebhookUrl: true } });
  if (!clan?.discordWebhookUrl) return apiError("VALIDATION_ERROR", 400, "Webhook no configurado");

  try {
    const res = await fetch(clan.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "🧪 Test desde Avalon Tracker — webhook funcionando." }),
    });
    if (!res.ok) return apiError("VALIDATION_ERROR", 400, `Webhook respondió ${res.status}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/clans/[clanId]/webhook-test/route.ts
git commit -m "feat(api): webhook-test endpoint"
```

### Task 8.3: /api/me endpoints

**Files:**
- Create: `src/app/api/me/route.ts`
- Create: `src/app/api/me/clans/route.ts`
- Create: `src/app/api/me/refresh-roles/route.ts`

- [ ] **Step 1: /api/me**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return apiError("NOT_FOUND", 404, "Usuario no encontrado");
  return NextResponse.json({
    id: user.id,
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    globalNickname: user.globalNickname,
    displayName: user.displayName,
    image: user.image,
    isSuperAdmin: user.isSuperAdmin,
  });
}

const patchSchema = z.object({ displayName: z.string().min(1).max(40).nullable() });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  await prisma.user.update({ where: { id: session.user.id }, data: { displayName: parsed.data.displayName } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: /api/me/clans**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: session.user.id, appRole: { not: null } } } },
    include: { members: { where: { userId: session.user.id }, select: { appRole: true } } },
  });
  return NextResponse.json(clans.map((c) => ({
    id: c.id, name: c.name, discordGuildName: c.discordGuildName, discordGuildIcon: c.discordGuildIcon,
    myRole: c.members[0]?.appRole ?? null,
  })));
}
```

- [ ] **Step 3: /api/me/refresh-roles**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateRoleCache, getUserRoleInClan } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { consumeToken, createLimiter } from "@/lib/rate-limit";

const limiter = createLimiter({ windowMs: 60_000, max: 5 });

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");

  const r = consumeToken(limiter, session.user.id);
  if (!r.ok) return apiError("RATE_LIMITED", 429, "Demasiadas peticiones", { retryAfterMs: r.retryAfterMs });

  invalidateRoleCache(session.user.id);
  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: session.user.id } } },
    select: { id: true },
  });
  for (const c of clans) await getUserRoleInClan(session.user.id, c.id);

  return NextResponse.json({ ok: true, refreshed: clans.length });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/me
git commit -m "feat(api): /api/me endpoints"
```

---

## Fase 9: Webhooks entrantes desde Vigil Bot

### Task 9.1: Webhook role-change

**Files:**
- Create: `src/app/api/webhooks/vigil/role-change/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/hmac";
import { prisma } from "@/lib/prisma";
import { invalidateRoleCache, getUserRoleInClan } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const schema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  discordId: z.string().regex(/^\d{17,20}$/),
  newRoleIds: z.array(z.string()),
  oldRoleIds: z.array(z.string()),
});

export async function POST(request: Request) {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) return apiError("INTERNAL", 500, "Secret no configurado");

  const signature = request.headers.get("x-vigil-signature") ?? "";
  const body = await request.text();
  if (!verifySignature(body, signature, secret)) return apiError("UNAUTHORIZED", 401, "Firma inválida");

  try {
    const data = schema.parse(JSON.parse(body));
    const user = await prisma.user.findUnique({ where: { discordId: data.discordId } });
    const clan = await prisma.clan.findUnique({ where: { discordGuildId: data.guildId } });
    if (!user || !clan) return NextResponse.json({ ignored: true });

    invalidateRoleCache(user.id, clan.id);
    await getUserRoleInClan(user.id, clan.id);
    logger.info({ userId: user.id, clanId: clan.id }, "role synced via webhook");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/vigil/role-change/route.ts
git commit -m "feat(webhooks): vigil role-change handler"
```

### Task 9.2: Webhook member-leave

**Files:**
- Create: `src/app/api/webhooks/vigil/member-leave/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/hmac";
import { prisma } from "@/lib/prisma";
import { invalidateRoleCache } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

const schema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  discordId: z.string().regex(/^\d{17,20}$/),
});

export async function POST(request: Request) {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) return apiError("INTERNAL", 500, "Secret no configurado");

  const signature = request.headers.get("x-vigil-signature") ?? "";
  const body = await request.text();
  if (!verifySignature(body, signature, secret)) return apiError("UNAUTHORIZED", 401, "Firma inválida");

  try {
    const data = schema.parse(JSON.parse(body));
    const user = await prisma.user.findUnique({ where: { discordId: data.discordId } });
    const clan = await prisma.clan.findUnique({ where: { discordGuildId: data.guildId } });
    if (!user || !clan) return NextResponse.json({ ignored: true });

    await prisma.clanMember.updateMany({
      where: { userId: user.id, clanId: clan.id },
      data: { appRole: null, lastSyncAt: new Date() },
    });
    invalidateRoleCache(user.id, clan.id);

    await prisma.auditLog.create({
      data: { clanId: clan.id, userId: user.id, action: "MEMBER_LEFT" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/vigil/member-leave/route.ts
git commit -m "feat(webhooks): vigil member-leave handler"
```

### Task 9.3: Webhook guild-update

**Files:**
- Create: `src/app/api/webhooks/vigil/guild-update/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/hmac";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";

const schema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  newName: z.string().min(1).max(100).optional(),
  newIcon: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const secret = process.env.VIGIL_BOT_SHARED_SECRET;
  if (!secret) return apiError("INTERNAL", 500, "Secret no configurado");

  const signature = request.headers.get("x-vigil-signature") ?? "";
  const body = await request.text();
  if (!verifySignature(body, signature, secret)) return apiError("UNAUTHORIZED", 401, "Firma inválida");

  try {
    const data = schema.parse(JSON.parse(body));
    await prisma.clan.updateMany({
      where: { discordGuildId: data.guildId },
      data: {
        discordGuildName: data.newName ?? undefined,
        discordGuildIcon: data.newIcon === undefined ? undefined : data.newIcon,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return internalError(e);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/vigil/guild-update/route.ts
git commit -m "feat(webhooks): vigil guild-update handler"
```

---

## Fase 10: Super admin endpoints

### Task 10.1: Middleware helper requireSuperAdmin

**Files:**
- Modify: `src/lib/permissions.ts` (append)

- [ ] **Step 1: Añadir helper**

En `src/lib/permissions.ts`, añadir al final:

```ts
export async function requireSuperAdmin(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!u?.isSuperAdmin) throw new PermissionError("INSUFFICIENT_ROLE", 403, { required: "SUPER_ADMIN" });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat(permissions): add requireSuperAdmin"
```

### Task 10.2: /api/admin/overview

**Files:**
- Create: `src/app/api/admin/overview/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const [clans, activeRoutes, usersActive24h, expiringSoon] = await Promise.all([
    prisma.clan.count(),
    prisma.route.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { updatedAt: { gte: yesterday } } }),
    prisma.routeHop.count({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * 60 * 1000) },
      },
    }),
  ]);
  return NextResponse.json({ clans, activeRoutes, usersActive24h, expiringSoon });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/overview/route.ts
git commit -m "feat(admin): overview endpoint"
```

### Task 10.3: /api/admin/routes + export CSV

**Files:**
- Create: `src/app/api/admin/routes/route.ts`
- Create: `src/app/api/admin/routes/export.csv/route.ts`

- [ ] **Step 1: /api/admin/routes**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const status = (url.searchParams.get("status") ?? "ACTIVE") as "ACTIVE" | "EXPIRED" | "DISABLED" | "ALL";
  const zone = url.searchParams.get("zone");
  const clanId = url.searchParams.get("clanId");

  const where: Record<string, unknown> = {};
  if (status !== "ALL") where.status = status;
  if (clanId) where.clanId = clanId;
  if (zone) where.hops = { some: { OR: [{ fromZone: { name: zone } }, { toZone: { name: zone } }] } };

  const [data, total] = await Promise.all([
    prisma.route.findMany({
      where,
      include: {
        clan: { select: { id: true, name: true } },
        hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
        createdBy: { select: { id: true, discordUsername: true, displayName: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.route.count({ where }),
  ]);
  return NextResponse.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}
```

- [ ] **Step 2: export.csv**

```ts
// src/app/api/admin/routes/export.csv/route.ts
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }

  const routes = await prisma.route.findMany({
    include: {
      clan: { select: { name: true } },
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { discordUsername: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const rows = ["clan,creador,cadena,sizes,createdAt,status,updatedAt"];
  for (const r of routes) {
    const chain = r.hops.map((h) => `${h.fromZone.name}->${h.toZone.name}`).join(" | ");
    const sizes = r.hops.map((h) => h.portalSize).join(",");
    const creator = r.createdBy.displayName ?? r.createdBy.discordUsername;
    rows.push([
      csvEscape(r.clan.name), csvEscape(creator), csvEscape(chain), csvEscape(sizes),
      csvEscape(r.createdAt.toISOString()), csvEscape(r.status), csvEscape(r.updatedAt.toISOString()),
    ].join(","));
  }
  return new Response(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="routes_${Date.now()}.csv"`,
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/routes
git commit -m "feat(admin): routes listing + CSV export"
```

### Task 10.4: /api/admin/clans, /users, /map

**Files:**
- Create: `src/app/api/admin/clans/route.ts`
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/map/route.ts`

- [ ] **Step 1: /api/admin/clans**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }
  const clans = await prisma.clan.findMany({
    include: {
      _count: { select: { members: true, routes: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(clans);
}
```

- [ ] **Step 2: /api/admin/users**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const users = await prisma.user.findMany({
    where: q
      ? { OR: [{ discordUsername: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : undefined,
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}
```

- [ ] **Step 3: /api/admin/map**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, PermissionError } from "@/lib/permissions";
import { apiError, internalError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  try { await requireSuperAdmin(session.user.id); }
  catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, "Solo super admin", e.extra);
    return internalError(e);
  }

  const url = new URL(request.url);
  const clanId = url.searchParams.get("clanId");
  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (clanId) where.clanId = clanId;

  const routes = await prisma.route.findMany({
    where,
    include: {
      clan: { select: { id: true, name: true } },
      hops: { orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
    },
  });
  return NextResponse.json(routes);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/clans src/app/api/admin/users src/app/api/admin/map
git commit -m "feat(admin): clans, users, map endpoints"
```

---

## Fase 11: Security hardening

### Task 11.1: Socket.io CORS + handshake auth

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Reemplazar io creation + añadir handshake**

Reemplazar el bloque de `server.ts` donde se crea `io` por:

```ts
import { getToken } from "next-auth/jwt";

io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.AUTH_URL ?? "http://localhost:3000",
    credentials: true,
  },
});

io.use(async (socket, next) => {
  try {
    const req = socket.request as unknown as { headers: Record<string, string> };
    const token = await getToken({
      req: req as never,
      secret: process.env.AUTH_SECRET!,
      salt: "authjs.session-token",
    });
    if (!token?.id) return next(new Error("unauthorized"));
    (socket.data as { userId: string }).userId = token.id as string;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("join-clan", async (clanId: string) => {
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId) return;
    const membership = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId, clanId } },
      select: { appRole: true },
    });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (!membership?.appRole && !user?.isSuperAdmin) return;
    socket.join(`clan:${clanId}`);
  });

  socket.on("leave-clan", (clanId: string) => socket.leave(`clan:${clanId}`));
  socket.on("disconnect", () => console.log(`Socket disconnected: ${socket.id}`));
});
```

- [ ] **Step 2: Commit**

```bash
git add server.ts
git commit -m "feat(socket): CORS restricted + JWT handshake + membership check"
```

### Task 11.2: Wiring rate limiter a endpoints sensibles

**Files:**
- Modify: varios route handlers

- [ ] **Step 1: Aplicar a callback Discord**

Next.js gestiona `/api/auth/callback/discord` internamente vía NextAuth; el rate limit más práctico es a nivel de nginx/Coolify o dentro de un middleware matcher. Para este plan, limitamos mediante un middleware custom en `src/middleware.ts`. Reemplazar el final de `src/middleware.ts`:

```ts
// al tope del archivo, tras el NextAuth setup:
import { consumeToken, createLimiter } from "@/lib/rate-limit";
const authCallbackLimiter = createLimiter({ windowMs: 60_000, max: 10 });

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  if (path.startsWith("/api/auth/callback/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const r = consumeToken(authCallbackLimiter, ip);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Demasiadas peticiones" } }), {
        status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(r.retryAfterMs / 1000)) },
      });
    }
  }

  const isAuth = path.startsWith("/clan") || path.startsWith("/admin") || path.startsWith("/profile") || path.startsWith("/dashboard");
  if (isAuth && !session?.user) return Response.redirect(new URL("/", nextUrl));
  if (path.startsWith("/admin")) {
    const isSuperAdmin = (session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
    if (!isSuperAdmin) return Response.redirect(new URL("/dashboard", nextUrl));
  }
});

export const config = {
  matcher: ["/clan/:path*", "/admin/:path*", "/profile/:path*", "/dashboard/:path*", "/api/auth/callback/:path*"],
};
```

- [ ] **Step 2: Aplicar rate limits a POST routes críticos**

En `src/app/api/clans/[clanId]/routes/route.ts` POST handler, al principio tras el `requireRole`:

```ts
import { consumeToken, createLimiter } from "@/lib/rate-limit";
const createLim = createLimiter({ windowMs: 60_000, max: 20 });
// ...
const r = consumeToken(createLim, session.user.id);
if (!r.ok) return apiError("RATE_LIMITED", 429, "Demasiadas rutas creadas", { retryAfterMs: r.retryAfterMs });
```

Repetir patrón para:
- `PATCH /api/clans/[clanId]/routes/[routeId]` — 60/min por user
- `GET /api/zones` — 60/min por user

(Copy-paste el bloque con `windowMs` y `max` adecuados, tras permission check.)

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts src/app/api/clans src/app/api/zones
git commit -m "feat(security): rate limit critical endpoints"
```

---

## Fase 12: Observabilidad + /api/health

### Task 12.1: /api/health

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Crear**

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchGuildHealth } from "@/lib/vigil-bot-client";

const started = Date.now();

export async function GET() {
  let dbOk = false;
  try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch {}
  let botOk = false;
  try {
    const guild = await prisma.clan.findFirst({ select: { discordGuildId: true } });
    if (guild) {
      const h = await fetchGuildHealth(guild.discordGuildId);
      botOk = h.installed;
    } else {
      botOk = true;
    }
  } catch { botOk = false; }
  return NextResponse.json({
    db: dbOk,
    vigilBot: botOk,
    uptime: Math.floor((Date.now() - started) / 1000),
  }, { status: dbOk ? 200 : 503 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat(health): /api/health endpoint"
```

### Task 12.2: pino-http en server.ts

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Añadir middleware de logging**

Al principio de `server.ts`, tras los imports:

```ts
import pinoHttp from "pino-http";
import { logger } from "./src/lib/logger";
const httpLogger = pinoHttp({ logger });
```

En `createServer`, envolver el handler:

```ts
const httpServer = createServer((req, res) => {
  httpLogger(req, res);
  handle(req, res);
});
```

- [ ] **Step 2: Commit**

```bash
git add server.ts
git commit -m "feat(observability): pino-http request logging"
```

---

## Fase 13: Limpieza + deploy

### Task 13.1: Dockerfile CMD actualizado

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Actualizar CMD**

Buscar la línea `CMD` al final del Dockerfile runtime y reemplazar por:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx scripts/seed-zones.ts && npx tsx scripts/import-world-graph.ts && npx tsx scripts/precompute-routing.ts && node server.js"]
```

Asegurar que en la stage runner están copiados:
- `scripts/` completo
- `src/data/` completo
- `prisma/` completo

(Si no están, añadir `COPY --from=builder /app/scripts ./scripts`, `COPY --from=builder /app/src/data ./src/data`, etc.)

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "chore(docker): seed + precompute in CMD"
```

### Task 13.2: Actualizar README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Añadir sección Env Vars y CF Access opcional**

Añadir al final del README (o en la sección existente):

```markdown
## Env Vars (producción)

Ver `.env.example` para la lista completa. Obligatorias:
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
- `AUTH_SECRET`, `AUTH_URL`
- `VIGIL_BOT_API_URL`, `VIGIL_BOT_SHARED_SECRET`
- `DATABASE_URL`
- `SUPER_ADMIN_DISCORD_IDS` (opcional — tu Discord ID separado por comas)

## Despliegue

1. Coolify detecta Dockerfile.
2. Configura env vars (sección arriba).
3. Healthcheck: `GET /api/health` cada 30s.
4. El arranque ejecuta migrate + seeds idempotentes.

## Hardening opcional: CloudFlare Access delante de `/admin/*`

Si quieres una capa extra para tu panel super admin:
1. En Cloudflare Zero Trust crea una Access Application apuntando a `avalon.crintech.pro/admin/*`.
2. Policy: email en `{tu email}`.
3. La app no requiere cambios — CF Access intercepta antes de llegar a Next.js.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: env vars + CF Access optional"
```

### Task 13.3: Merge a main (fin de Plan 1)

**Files:** N/A

- [ ] **Step 1: Asegurar tests pasan**

```bash
npm test
```
Expected: todos los tests PASS.

- [ ] **Step 2: Asegurar build pasa**

```bash
npm run build
```
Expected: build PASS.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feat/discord-redesign-backend
```

- [ ] **Step 4: Merge via PR o fast-forward (usuario decide)**

Esperar revisión o usar `gh pr create` si procede. **No merge automático.** El usuario decide cuándo integrar.

---

## Self-Review

**Spec coverage check:**
- Roles y permisos (spec §3) → Fase 2 (permissions.ts) + Fase 5-6-7 (endpoints)
- Arquitectura (§4) → toda la implementación
- Data model (§5) → Fase 1
- Auth (§6) → Fase 4
- Vigil Bot contract (§7) → Fase 3, 5 (role-mappings proxy), 9 (webhooks)
- UI grafo (§8) → **NO cubierto — Plan 2 (frontend)**
- Colaboración asíncrona (§9) → polling delta en Fase 6 (GET ?since=), version en Fase 6 PATCH
- Pathfinding (§10) → Fase 7
- Super admin (§11) → Fase 10
- Endpoints (§12) → Fases 5-10
- Migración (§13) → Fase 1 (big-bang) + Fase 13 (Dockerfile)
- Errores (§14) → api-error.ts Fase 2 + aplicado en cada endpoint
- Rate limits (§15) → Fase 2 + Fase 11
- Seguridad (§16) → Fase 4 (headers), Fase 11 (socket, rate-limit)
- Observabilidad (§17) → Fase 2 (logger) + Fase 12 (health + pino-http)
- Deploy (§18) → Fase 13
- Escalabilidad (§19) → `PRISMA_CLIENT_POOL_SIZE=5` en `.env.example` Fase 0

**Gaps conocidos (intencionales — van en Plan 2)**:
- UI grafo react-flow
- Lista fallback y mobile
- Super admin UI pages (dashboard, map, routes, clans)
- SWR polling integrado en cliente
- Create/edit route modal
- UI de mapping de roles

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-backend-redesign.md`. Dos opciones de ejecución:**

**1. Subagent-Driven (recomendado)** — dispatch fresh subagent por task, review entre tasks, iteración rápida.

**2. Inline Execution** — ejecutar tasks en esta sesión con executing-plans, batch con checkpoints.

**¿Qué enfoque prefieres?**
