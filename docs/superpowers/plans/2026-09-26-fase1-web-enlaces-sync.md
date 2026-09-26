# Fase 1 (web): enlaces compartidos, dispositivos, API v1 de sincronización, /i y /m — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un mapa personal se pueda compartir por enlace (ver/editar, revocable), que un dispositivo se vincule a la cuenta con un token, que exista la API v1 con la que la app KMP sincronizará, y que los enlaces `/i/<código>` de la app actual dejen de dar 404.

**Architecture:** Todo vive en la web Next.js existente (App Router, Prisma 7 sobre Postgres). Dos tablas nuevas (`DeviceToken`, `MapShare`) y una columna (`Route.deletedAt`). La API v1 (`/api/v1/*`) autentica por sesión web **o** por token de dispositivo (`Authorization: Bearer`) y reutiliza `requireRole`, `logAudit` y la rama «mapa personal» de permisos. Nada de esto toca clanes de Discord ni Vigil.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma 7 + `@prisma/adapter-pg`, NextAuth v5, zod 4, vitest 3 con PGlite (Postgres real en proceso), Playwright para humo, `qrcode` (QR en SVG, nuevo), `lru-cache` (ya presente).

**Spec:** `docs/superpowers/specs/2026-09-26-avalon-enlazar-todo-design.md` (§5, §6, §8, §10, §11, §12.1).

## Global Constraints

- Commits como `Crinlorite <xlorit@hotmail.es>`, sin líneas de atribución. Mensajes en castellano.
- **Nada se despliega sin OK explícito de Crinlorite.** Subir a `main` no despliega (Coolify no recibe el webhook); el despliegue es una acción aparte.
- Tamaño de portal, estándar del juego: **7 o 20** al escribir; 2 y 40 solo se conservan en filas existentes (spec §6.2).
- Papelera: **7 días** en una única constante `TRASH_TTL_MS` (spec §6.4).
- Tokens de enlace y de dispositivo: **128 bits**, solo el **hash SHA-256** en BD (spec §5, §10).
- Enlaces compartidos solo en mapas `PERSONAL`; los `DISCORD` responden 403 (spec §5.3).
- Regla de conflicto de sincronización: **el servidor manda**; nunca el reloj del cliente (spec §6.2).
- Lotes de sincronización ≤ **200** filas; paginación de bajada a **500** filas (spec §6.2).
- Códigos de compartir: formato **v1** exacto de la app Flutter (JSON compacto → gzip → base64url sin `=`) (spec §8).
- Sin captura automática de ninguna clase; no mencionar herramientas privadas (spec §13).
- Textos de UI nuevos en EN y ES en `src/i18n/translations.ts` (el resto de idiomas cae a EN).
- Tests de nivel 🔴 (aislamiento, tokens, fusión, sincronización) contra Postgres real con PGlite, siguiendo `tests/db/personal-maps.test.ts`.

## Review Focus

1. **Enlace de editar abierto por alguien que ya es ADMIN del mapa** (el dueño abre su propio enlace): no debe degradarse a EDITOR. Test en la Tarea 7 (`join` no toca una membresía existente de rango igual o superior).
2. **Lote de sincronización con dos saltos de la misma clave natural** `(routeId, fromZone, toZone)`: debe aplicarse una sola vez y responder 200, no 500 por `P2002`. Test en la Tarea 6.
3. **Reclamar un código de vínculo dos veces en paralelo**: solo una reclamación recibe token. Test en la Tarea 4 (dos `claim` consecutivos con el mismo código → el segundo 400).
4. **Código `/i/` con gzip válido pero JSON gigante** (bomba de descompresión): el decodificador limita la salida a 64 KiB y rechaza. Test en la Tarea 9.
5. **`since` con fecha futura o inválida en `changes`**: 400, nunca una consulta vacía silenciosa. Test en la Tarea 6.

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `prisma/schema.prisma` | `Route.deletedAt`, modelos `DeviceToken` y `MapShare` |
| `src/lib/trash.ts` | `TRASH_TTL_MS` y `trashDeadline()` |
| `src/lib/device-tokens.ts` | crear/verificar/revocar tokens de dispositivo; códigos de vínculo firmados de un solo uso |
| `src/lib/api-auth.ts` | `getApiUser(req)`: sesión web o Bearer → usuario |
| `src/lib/sync.ts` | `pullChanges()` y `applyChanges()` (regla «el servidor manda») |
| `src/lib/map-shares.ts` | crear/listar/revocar/verificar enlaces; `joinByShare()` |
| `src/lib/route-codec.ts` | codec v1 de la app (decode/encode) |
| `src/app/api/v1/**` | endpoints finos que llaman a `src/lib/*` |
| `src/app/link/app/page.tsx` | login con Discord para vincular la app |
| `src/app/m/[token]/page.tsx` + `src/components/share/ReadOnlyMap.tsx` | mapa compartido |
| `src/app/i/[code]/page.tsx` + `src/components/share/ImportRoute.tsx` | importar ruta desde código |
| `src/app/.well-known/*` | AASA y assetlinks |
| `src/components/clan/ShareLinksPanel.tsx`, `src/components/profile/DevicesPanel.tsx` | UI de compartir y de dispositivos |
| `tests/db/*.test.ts` | tests 🔴 sobre PGlite |

Convención de tests: cada fichero de `tests/db/` arranca su PGlite con `startTestDb()` en `beforeAll` **antes** de importar módulos que usen Prisma (import dinámico), mockea `@/lib/auth` con `vi.mock` y `@/lib/vigil-bot-client` como en `tests/db/personal-maps.test.ts`. Los handlers se invocan directamente (`POST(new Request(...), { params: Promise.resolve({...}) })`).

---

### Task 1: Papelera a 7 días y `Route.deletedAt`

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Route`)
- Create: `src/lib/trash.ts`
- Modify: `src/app/api/clans/[clanId]/routes/route.ts` (barrido, líneas 44-140)
- Modify: `src/app/api/clans/[clanId]/routes/[routeId]/route.ts` (DELETE, líneas 100-175)
- Modify: `src/app/api/clans/[clanId]/routes/[routeId]/restore/route.ts`
- Modify: `src/app/api/clans/[clanId]/trash/route.ts` (constante `TTL_MS`)
- Modify: `src/app/(auth)/clan/[clanId]/trash/page.tsx:111`, `src/components/routes/RouteListTable.tsx:46`, `src/i18n/translations.ts` (`trash.subtitle` EN/ES)
- Test: `tests/db/trash.test.ts`

**Interfaces:**
- Produces: `TRASH_TTL_MS: number` (7 días en ms) y `trashDeadline(deletedAt: Date): Date` en `src/lib/trash.ts`. Columna `Route.deletedAt: DateTime?` (nula = fuera de la papelera).

- [ ] **Step 1: Añadir la columna al esquema**

En `prisma/schema.prisma`, dentro de `model Route`, tras `disabledAt DateTime?`:

```prisma
  // Papelera: fecha de borrado de la ruta ENTERA (borrar solo algunos
  // saltos deja esto a null y marca deletedAt en los saltos). Se
  // sincroniza con la app como un hecho más (spec §6.4).
  deletedAt     DateTime?
```

y añade el índice al final del modelo: `@@index([deletedAt])`. Ejecuta `npx prisma generate`.

- [ ] **Step 2: Crear la constante compartida**

```ts
// src/lib/trash.ts
// Ventana de recuperación de la papelera, común a web y app (spec §6.4).
export const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function trashDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_TTL_MS);
}
```

- [ ] **Step 3: Escribir los tests que fallan**

```ts
// tests/db/trash.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";

vi.mock("@/lib/vigil-bot-client", () => ({
  fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {},
}));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));

let db: Awaited<ReturnType<typeof startTestDb>>;
let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

let seq = 0;
async function ownerWithMap() {
  seq++;
  const u = await prisma.user.create({ data: { discordId: `1000000000000000${seq}`.slice(0, 18), discordUsername: `u${seq}`, email: `u${seq}@x.test` } });
  const clan = await prisma.clan.create({ data: { name: `map-${seq}`, kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  const [a, b, c] = await Promise.all(["Casitos-Atinaum", "Hiles-Izizaum", "Coros-Atinaum"].map((name) =>
    prisma.zone.upsert({ where: { name }, create: { name, type: "AVALON", tier: 6 }, update: {} })));
  const route = await prisma.route.create({ data: { clanId: clan.id, createdById: u.id, hops: { create: [
    { order: 0, fromZoneId: a.id, toZoneId: b.id, portalSize: 7, expiresAt: new Date(Date.now() + 3600e3) },
    { order: 1, fromZoneId: b.id, toZoneId: c.id, portalSize: 20, expiresAt: new Date(Date.now() + 7200e3) },
  ] } }, include: { hops: true } });
  session.current = { user: { id: u.id } };
  return { u, clan, route };
}
const ctx = (clanId: string, routeId: string) => ({ params: Promise.resolve({ clanId, routeId }) });

describe("papelera 7 días", () => {
  it("borrar la ruta entera marca Route.deletedAt; borrar un salto no", async () => {
    const { DELETE } = await import("@/app/api/clans/[clanId]/routes/[routeId]/route");
    const { clan, route } = await ownerWithMap();
    const partial = await DELETE(new Request(`http://t/x?hops=${route.hops[1].id}`, { method: "DELETE" }), ctx(clan.id, route.id));
    expect(partial.status).toBe(204);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: route.id } })).deletedAt).toBeNull();
    const whole = await DELETE(new Request("http://t/x", { method: "DELETE" }), ctx(clan.id, route.id));
    expect(whole.status).toBe(204);
    const r = await prisma.route.findUniqueOrThrow({ where: { id: route.id }, include: { hops: true } });
    expect(r.deletedAt).not.toBeNull();
    expect(r.hops.every((h) => h.deletedAt !== null)).toBe(true);
  });

  it("restaurar limpia Route.deletedAt", async () => {
    const { DELETE } = await import("@/app/api/clans/[clanId]/routes/[routeId]/route");
    const { POST: restore } = await import("@/app/api/clans/[clanId]/routes/[routeId]/restore/route");
    const { clan, route } = await ownerWithMap();
    await DELETE(new Request("http://t/x", { method: "DELETE" }), ctx(clan.id, route.id));
    expect((await restore(new Request("http://t/x", { method: "POST" }), ctx(clan.id, route.id))).status).toBe(200);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: route.id } })).deletedAt).toBeNull();
  });

  it("el barrido conserva a los 6 días y elimina a los 8", async () => {
    const { GET } = await import("@/app/api/clans/[clanId]/routes/route");
    const { clan, route } = await ownerWithMap();
    const at = (days: number) => new Date(Date.now() - days * 864e5);
    await prisma.route.update({ where: { id: route.id }, data: { deletedAt: at(6), hops: { updateMany: { where: {}, data: { deletedAt: at(6) } } } } });
    await GET(new Request("http://t/x"), { params: Promise.resolve({ clanId: clan.id }) });
    expect(await prisma.route.findUnique({ where: { id: route.id } })).not.toBeNull();
    await prisma.route.update({ where: { id: route.id }, data: { deletedAt: at(8), hops: { updateMany: { where: {}, data: { deletedAt: at(8) } } } } });
    await GET(new Request("http://t/x"), { params: Promise.resolve({ clanId: clan.id }) });
    expect(await prisma.route.findUnique({ where: { id: route.id } })).toBeNull();
  });
});
```

- [ ] **Step 4: Ejecutar y ver que falla**

Run: `npx vitest run tests/db/trash.test.ts`
Expected: FAIL — `deletedAt` no existe en `Route` (primer test) o la ruta sigue existiendo a los 8 días (tercer test, porque el barrido usa 2 días y no mira `Route.deletedAt`).

- [ ] **Step 5: Aplicar el TTL y `Route.deletedAt` en los cuatro handlers**

En `routes/route.ts`: importa `import { TRASH_TTL_MS } from "@/lib/trash";`, sustituye `const ttlMs = 2 * 24 * 60 * 60 * 1000;` por `const ttlMs = TRASH_TTL_MS;` y añade, justo antes del paso 3 («Hard-delete de Routes que ya no tienen ningún hop»):

```ts
  // 2b) Hard-delete de rutas enteras en papelera más de TRASH_TTL_MS.
  await prisma.route.deleteMany({ where: { clanId, deletedAt: { lt: ttlAgo } } });
```

En el mismo fichero, en el paso 1 (transición a EXPIRED), añade `deletedAt: now` al `route.updateMany` para que una ruta caducada entera entre en la papelera como hecho de ruta:

```ts
      prisma.route.updateMany({ where: { id: { in: expiringIds } }, data: { status: "EXPIRED", deletedAt: now } }),
```

En `[routeId]/route.ts` (DELETE), sustituye el `prisma.route.update` que incrementa `version` por:

```ts
  await prisma.route.update({
    where: { id: routeId },
    data: { version: { increment: 1 }, ...(action === "ROUTE_DELETE" ? { deletedAt: now } : {}) },
  });
```

y en el `logAudit` de ese handler cambia `recoverableUntil: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString()` por `recoverableUntil: trashDeadline(now).toISOString()` (importa `trashDeadline` de `@/lib/trash`).

En `restore/route.ts`, en el `prisma.route.update` de la transacción añade `deletedAt: null`:

```ts
      data: { version: { increment: 1 }, deletedAt: null, ...(shouldReactivate ? { status: "ACTIVE" } : {}) },
```

En `trash/route.ts` sustituye `const TTL_MS = 2 * 24 * 60 * 60 * 1000;` por `import { TRASH_TTL_MS as TTL_MS } from "@/lib/trash";` (borra el comentario que decía que debe coincidir con routes/route.ts: ahora es la misma constante).

- [ ] **Step 6: Textos**

- `src/app/(auth)/clan/[clanId]/trash/page.tsx:111`: «tras 2 días» → «tras 7 días».
- `src/components/routes/RouteListTable.tsx:46`: «papelera 2 días» → «papelera 7 días».
- `src/i18n/translations.ts`: en `trash.subtitle` (EN y ES) cambia «2 days»/«2 días» por «7 days»/«7 días».

- [ ] **Step 7: Ejecutar tests y typecheck**

Run: `npx vitest run tests/db/trash.test.ts && npx tsc --noEmit -p .`
Expected: 3 tests PASS; tsc sin errores.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma src/lib/trash.ts src/app/api/clans src/app/\(auth\)/clan src/components/routes/RouteListTable.tsx src/i18n/translations.ts tests/db/trash.test.ts
git commit -m "papelera: 7 días en una sola constante y Route.deletedAt para borrados enteros"
```

### Task 2: Tamaño de portal al estándar del juego (7 y 20)

**Files:**
- Modify: `src/app/api/clans/[clanId]/routes/route.ts:12-17` (`hopSchema`)
- Modify: `src/app/api/clans/[clanId]/routes/[routeId]/hops/route.ts:12-17` (`appendSchema`)
- Modify: `src/components/routes/CreateRouteModal.tsx:7,102-107`
- Modify: `src/components/routes/AppendHopModal.tsx:8,132-137`
- Test: `tests/db/portal-size.test.ts`

**Interfaces:**
- Produces: tipo `PortalSize = 7 | 20` exportado desde `src/lib/portal-size.ts` (lo consumen la Tarea 6 y la Tarea 9).

- [ ] **Step 1: Test que falla**

```ts
// tests/db/portal-size.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";
vi.mock("@/lib/vigil-bot-client", () => ({ fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {} }));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
let db: Awaited<ReturnType<typeof startTestDb>>; let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

it("acepta 7 y 20; rechaza 2 y 40 al crear", async () => {
  const { POST } = await import("@/app/api/clans/[clanId]/routes/route");
  const u = await prisma.user.create({ data: { discordId: "100000000000000001", discordUsername: "u", email: "u@x.test" } });
  const clan = await prisma.clan.create({ data: { name: "m", kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN" } });
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum"]) await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} });
  session.current = { user: { id: u.id } };
  const post = (portalSize: number) => POST(new Request("http://t/x", { method: "POST", body: JSON.stringify({ hops: [
    { fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize, expiresAt: new Date(Date.now() + 3600e3).toISOString() }] }) }),
    { params: Promise.resolve({ clanId: clan.id }) });
  expect((await post(40)).status).toBe(400);
  expect((await post(2)).status).toBe(400);
  expect((await post(7)).status).toBe(201);
});
```

Run: `npx vitest run tests/db/portal-size.test.ts` — Expected: FAIL (el 40 responde 201).

- [ ] **Step 2: Constante y esquemas**

```ts
// src/lib/portal-size.ts
// Estándar actual del juego: portales de 7 (azul) o 20 (amarillo) cargas.
// 2 y 40 existen en filas antiguas y se muestran tal cual, pero no se
// aceptan al escribir (spec §6.2).
import { z } from "zod";
export const PORTAL_SIZES = [7, 20] as const;
export type PortalSize = (typeof PORTAL_SIZES)[number];
export const portalSizeSchema = z.union([z.literal(7), z.literal(20)]);
```

En `routes/route.ts` y `hops/route.ts` sustituye `portalSize: z.union([z.literal(7), z.literal(20), z.literal(40)]),` por `portalSize: portalSizeSchema,` (importa `import { portalSizeSchema } from "@/lib/portal-size";`).

- [ ] **Step 3: Selectores**

`CreateRouteModal.tsx`: tipo `portalSize: 7 | 20` en `HopInput` (línea 7) y `as 7 | 20` en el `onChange`; deja solo las opciones `<option value={7}>7p</option>` y `<option value={20}>20p</option>` (fuera la de 40 «Tentáculo»). `AppendHopModal.tsx`: `type PortalSize = 7 | 20;` (línea 8) y las mismas dos opciones (líneas 135-137).

- [ ] **Step 4: Verificar y commit**

Run: `npx vitest run tests/db/portal-size.test.ts && npx tsc --noEmit -p .` — Expected: PASS.

```bash
git add src/lib/portal-size.ts src/app/api/clans src/components/routes tests/db/portal-size.test.ts
git commit -m "portales: tamaño 7 o 20 (estándar del juego); fuera el 40"
```

### Task 3: Tokens de dispositivo y autenticación de la API v1

**Files:**
- Modify: `prisma/schema.prisma` (modelo `DeviceToken` + relación en `User`)
- Create: `src/lib/device-tokens.ts`
- Create: `src/lib/api-auth.ts`
- Test: `tests/db/device-tokens.test.ts`

**Interfaces:**
- Consumes: `signBody`, `verifySignature` de `src/lib/hmac.ts`; `prisma`.
- Produces:
  - `createDeviceToken(userId: string, name: string): Promise<{ token: string; deviceId: string }>`
  - `verifyDeviceToken(token: string | null | undefined): Promise<{ userId: string; deviceId: string } | null>`
  - `listDeviceTokens(userId: string): Promise<{ id: string; name: string; createdAt: Date; lastUsedAt: Date | null }[]>` (solo no revocados)
  - `revokeDeviceToken(userId: string, deviceId: string): Promise<boolean>`
  - `signLinkCode(userId: string, now?: number): string` · `consumeLinkCode(code: string | undefined, now?: number): string | null` (userId; un solo uso; 60 s)
  - `getApiUser(req: Request): Promise<{ userId: string; via: "session" | "device"; deviceId?: string } | null>` en `src/lib/api-auth.ts`

- [ ] **Step 1: Esquema**

```prisma
// Token de dispositivo: autentica SOLO /api/v1 (app móvil). Se guarda el
// hash SHA-256; el token se enseña una vez al crearlo (spec §5.2).
model DeviceToken {
  id         String    @id @default(cuid())
  userId     String
  name       String
  tokenHash  String    @unique
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

En `model User` añade `deviceTokens DeviceToken[]`. `npx prisma generate`.

- [ ] **Step 2: Tests que fallan**

```ts
// tests/db/device-tokens.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-device-tokens-0123456789";
let db: Awaited<ReturnType<typeof startTestDb>>; let prisma: typeof import("@/lib/prisma").prisma;
let dt: typeof import("@/lib/device-tokens"); let apiAuth: typeof import("@/lib/api-auth");
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; dt = await import("@/lib/device-tokens"); apiAuth = await import("@/lib/api-auth"); }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
let seq = 0;
const user = () => prisma.user.create({ data: { discordId: `2000000000000000${++seq}`.slice(0, 18), discordUsername: `d${seq}`, email: `d${seq}@x.test` } });

describe("tokens de dispositivo", () => {
  it("crea, verifica y solo guarda el hash", async () => {
    const u = await user();
    const { token, deviceId } = await dt.createDeviceToken(u.id, "iPhone");
    expect(token.startsWith("avt_")).toBe(true);
    expect(await dt.verifyDeviceToken(token)).toEqual({ userId: u.id, deviceId });
    const row = await prisma.deviceToken.findUniqueOrThrow({ where: { id: deviceId } });
    expect(row.tokenHash).not.toContain(token.slice(4, 20));
  });
  it("rechaza manipulado, desconocido, vacío y revocado", async () => {
    const u = await user();
    const { token, deviceId } = await dt.createDeviceToken(u.id, "x");
    expect(await dt.verifyDeviceToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await dt.verifyDeviceToken("avt_" + "x".repeat(43))).toBeNull();
    expect(await dt.verifyDeviceToken("")).toBeNull();
    expect(await dt.revokeDeviceToken(u.id, deviceId)).toBe(true);
    expect(await dt.verifyDeviceToken(token)).toBeNull();
    expect(await dt.listDeviceTokens(u.id)).toHaveLength(0);
  });
  it("no deja revocar el dispositivo de otro usuario", async () => {
    const a = await user(); const b = await user();
    const { deviceId } = await dt.createDeviceToken(a.id, "x");
    expect(await dt.revokeDeviceToken(b.id, deviceId)).toBe(false);
    expect(await dt.listDeviceTokens(a.id)).toHaveLength(1);
  });
});

describe("códigos de vínculo", () => {
  it("válido una sola vez, dentro de 60 s", () => {
    const code = dt.signLinkCode("cuser1234567890abcdef");
    expect(dt.consumeLinkCode(code)).toBe("cuser1234567890abcdef");
    expect(dt.consumeLinkCode(code)).toBeNull();
  });
  it("rechaza caducado, firma falsa y formato raro", () => {
    expect(dt.consumeLinkCode(dt.signLinkCode("cuser1234567890abcdef", Date.now() - 61_000))).toBeNull();
    const good = dt.signLinkCode("cuser1234567890abcdef");
    const [id, exp, nonce, sig] = good.split(".");
    expect(dt.consumeLinkCode(`cother1234567890abcde.${exp}.${nonce}.${sig}`)).toBeNull();
    expect(dt.consumeLinkCode(`${id}.${exp}.${nonce}.${"0".repeat(64)}`)).toBeNull();
    for (const bad of ["", "a.b.c", "a.b.c.d.e", "x".repeat(600)]) expect(dt.consumeLinkCode(bad)).toBeNull();
    expect(dt.consumeLinkCode(undefined)).toBeNull();
  });
});

describe("getApiUser", () => {
  it("Bearer válido → dispositivo; Bearer inválido → null aunque haya sesión; sin Bearer → sesión", async () => {
    const u = await user();
    const { token, deviceId } = await dt.createDeviceToken(u.id, "x");
    session.current = { user: { id: "csession000000000000000" } };
    expect(await apiAuth.getApiUser(new Request("http://t/", { headers: { authorization: `Bearer ${token}` } }))).toEqual({ userId: u.id, via: "device", deviceId });
    expect(await apiAuth.getApiUser(new Request("http://t/", { headers: { authorization: "Bearer avt_nope" } }))).toBeNull();
    expect(await apiAuth.getApiUser(new Request("http://t/"))).toEqual({ userId: "csession000000000000000", via: "session" });
    session.current = null;
    expect(await apiAuth.getApiUser(new Request("http://t/"))).toBeNull();
  });
});
```

Run: `npx vitest run tests/db/device-tokens.test.ts` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementación**

```ts
// src/lib/device-tokens.ts
import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import { prisma } from "@/lib/prisma";
import { signBody, verifySignature } from "@/lib/hmac";

// Token de dispositivo: `avt_` + 32 bytes aleatorios en base64url. En BD
// solo el SHA-256. Autentica únicamente /api/v1 (spec §5.2, §10).
const PREFIX = "avt_";
const LAST_USED_EVERY_MS = 60 * 60 * 1000;

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado");
  return s;
}

export async function createDeviceToken(userId: string, name: string) {
  const token = PREFIX + crypto.randomBytes(32).toString("base64url");
  const row = await prisma.deviceToken.create({
    data: { userId, name: name.trim().slice(0, 60) || "Dispositivo", tokenHash: hash(token) },
    select: { id: true },
  });
  return { token, deviceId: row.id };
}

export async function verifyDeviceToken(token: string | null | undefined) {
  if (!token || !token.startsWith(PREFIX) || token.length < 40 || token.length > 200) return null;
  const row = await prisma.deviceToken.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, userId: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row || row.revokedAt) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    await prisma.deviceToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { userId: row.userId, deviceId: row.id };
}

export function listDeviceTokens(userId: string) {
  return prisma.deviceToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeDeviceToken(userId: string, deviceId: string): Promise<boolean> {
  const r = await prisma.deviceToken.updateMany({ where: { id: deviceId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count > 0;
}

// Código de vínculo (QR o /link/app): firmado con AUTH_SECRET, 60 s, un
// solo uso. La lista de usados vive en memoria: la app corre en una sola
// instancia (como los límites de peticiones).
const LINK_TTL_MS = 60_000;
const used = new LRUCache<string, true>({ max: 10_000, ttl: LINK_TTL_MS * 2 });

export function signLinkCode(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + LINK_TTL_MS}.${crypto.randomBytes(8).toString("base64url")}`;
  return `${payload}.${signBody(payload, secret())}`;
}

export function consumeLinkCode(code: string | undefined, now = Date.now()): string | null {
  if (!code || code.length > 256) return null;
  const parts = code.split(".");
  if (parts.length !== 4) return null;
  const [userId, exp, nonce, sig] = parts;
  if (!/^[a-z0-9]{10,40}$/i.test(userId) || !/^\d{10,16}$/.test(exp) || !/^[A-Za-z0-9_-]{8,16}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (!verifySignature(`${userId}.${exp}.${nonce}`, sig, secret())) return null;
  if (Number(exp) < now) return null;
  if (used.has(code)) return null;
  used.set(code, true);
  return userId;
}
```

```ts
// src/lib/api-auth.ts
import { auth } from "@/lib/auth";
import { verifyDeviceToken } from "@/lib/device-tokens";

export type ApiUser = { userId: string; via: "session" | "device"; deviceId?: string };

// /api/v1: token de dispositivo (Bearer) o sesión web. Si viene un Bearer
// y no es válido, NO se cae a la sesión: se rechaza.
export async function getApiUser(req: Request): Promise<ApiUser | null> {
  const h = req.headers.get("authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) {
    const v = await verifyDeviceToken(h.slice(7).trim());
    return v ? { userId: v.userId, via: "device", deviceId: v.deviceId } : null;
  }
  const session = await auth();
  return session?.user?.id ? { userId: session.user.id, via: "session" } : null;
}
```

- [ ] **Step 4: Verificar y commit**

Run: `npx vitest run tests/db/device-tokens.test.ts && npx tsc --noEmit -p .` — Expected: 6 tests PASS.

```bash
git add prisma/schema.prisma src/lib/device-tokens.ts src/lib/api-auth.ts tests/db/device-tokens.test.ts
git commit -m "api v1: tokens de dispositivo y códigos de vínculo de un solo uso"
```

### Task 4: Endpoints de dispositivos, invitado y fusión (`/api/v1/devices/*`, `/api/v1/guest`, `/api/v1/me`, `/api/v1/me/merge`)

**Files:**
- Modify: `src/lib/api-auth.ts` (añade `clientIp`)
- Create: `src/app/api/v1/devices/link/route.ts`, `src/app/api/v1/devices/claim/route.ts`, `src/app/api/v1/devices/route.ts`, `src/app/api/v1/devices/[id]/route.ts`, `src/app/api/v1/guest/route.ts`, `src/app/api/v1/me/route.ts`, `src/app/api/v1/me/merge/route.ts`
- Test: `tests/db/devices-api.test.ts`

**Interfaces:**
- Consumes: Tarea 3; `createGuestUser`, `mergeGuestInto` de `src/lib/guest.ts`; `createLimiter`, `consumeToken` de `src/lib/rate-limit.ts`; `apiError`, `internalError`.
- Produces (contratos JSON):
  - `POST /api/v1/devices/link` (sesión) → `{ code, expiresAt }`
  - `POST /api/v1/devices/claim { code, deviceName }` → `{ token, deviceId, userId, isGuest }`
  - `GET /api/v1/devices` → `{ devices: [{ id, name, createdAt, lastUsedAt }] }` · `DELETE /api/v1/devices/{id}` → 204
  - `POST /api/v1/guest { deviceName }` → `{ token, deviceId, userId, isGuest: true }`
  - `GET /api/v1/me` → `{ id, isGuest, name }`
  - `POST /api/v1/me/merge { guestToken }` (Bearer de cuenta Discord) → `{ merged: true, maps }`
  - `clientIp(req: Request): string`

- [ ] **Step 1: Tests que fallan**

```ts
// tests/db/devices-api.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-devices-api-0123456789ab";
let db: Awaited<ReturnType<typeof startTestDb>>; let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
let seq = 0;
const discordUser = () => prisma.user.create({ data: { discordId: `3000000000000000${++seq}`.slice(0, 18), discordUsername: `d${seq}`, email: `d${seq}@x.test` } });
const json = (url: string, body?: unknown, headers: Record<string, string> = {}, method = "POST") =>
  new Request(url, { method, headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${seq}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("vincular dispositivo", () => {
  it("link → claim → el token vale; el código no se reutiliza; código falso → 400", async () => {
    const { POST: link } = await import("@/app/api/v1/devices/link/route");
    const { POST: claim } = await import("@/app/api/v1/devices/claim/route");
    const { GET: list } = await import("@/app/api/v1/devices/route");
    const u = await discordUser(); session.current = { user: { id: u.id } };
    const { code } = await (await link(json("http://t/api/v1/devices/link"))).json();
    session.current = null;
    const r = await claim(json("http://t/api/v1/devices/claim", { code, deviceName: "Pixel" }));
    expect(r.status).toBe(200);
    const { token, userId, isGuest } = await r.json();
    expect(userId).toBe(u.id); expect(isGuest).toBe(false);
    expect((await claim(json("http://t/api/v1/devices/claim", { code, deviceName: "otra vez" }))).status).toBe(400);
    expect((await claim(json("http://t/api/v1/devices/claim", { code: "a.b.c.d", deviceName: "x" }))).status).toBe(400);
    const devices = await (await list(json("http://t/api/v1/devices", undefined, { authorization: `Bearer ${token}` }, "GET"))).json();
    expect(devices.devices.map((d: { name: string }) => d.name)).toEqual(["Pixel"]);
  });
  it("revocar deja el token muerto; revocar el de otro → 404", async () => {
    const { DELETE: revoke } = await import("@/app/api/v1/devices/[id]/route");
    const { GET: list } = await import("@/app/api/v1/devices/route");
    const dt = await import("@/lib/device-tokens");
    const a = await discordUser(); const b = await discordUser();
    const ta = await dt.createDeviceToken(a.id, "A"); const tb = await dt.createDeviceToken(b.id, "B");
    expect((await revoke(json("http://t/x", undefined, { authorization: `Bearer ${tb.token}` }, "DELETE"), { params: Promise.resolve({ id: ta.deviceId }) })).status).toBe(404);
    expect((await revoke(json("http://t/x", undefined, { authorization: `Bearer ${ta.token}` }, "DELETE"), { params: Promise.resolve({ id: ta.deviceId }) })).status).toBe(204);
    expect((await list(json("http://t/x", undefined, { authorization: `Bearer ${ta.token}` }, "GET"))).status).toBe(401);
  });
});

describe("invitado y fusión desde la app", () => {
  it("POST /guest crea invitado con token; /me lo describe", async () => {
    const { POST: guest } = await import("@/app/api/v1/guest/route");
    const { GET: me } = await import("@/app/api/v1/me/route");
    const r = await guest(json("http://t/api/v1/guest", { deviceName: "iPhone" }));
    expect(r.status).toBe(201);
    const { token, isGuest } = await r.json(); expect(isGuest).toBe(true);
    const m = await (await me(json("http://t/x", undefined, { authorization: `Bearer ${token}` }, "GET"))).json();
    expect(m.isGuest).toBe(true);
  });
  it("merge pasa los mapas del invitado a la cuenta Discord y mata su token; un invitado no puede ser destino", async () => {
    const { POST: guest } = await import("@/app/api/v1/guest/route");
    const { POST: merge } = await import("@/app/api/v1/me/merge/route");
    const { GET: me } = await import("@/app/api/v1/me/route");
    const dt = await import("@/lib/device-tokens");
    const g = await (await guest(json("http://t/api/v1/guest", { deviceName: "iPhone" }))).json();
    const clan = await prisma.clan.create({ data: { name: `g-${seq}`, kind: "PERSONAL", createdById: g.userId } });
    await prisma.clanMember.create({ data: { userId: g.userId, clanId: clan.id, appRole: "ADMIN" } });
    const d = await discordUser(); const td = await dt.createDeviceToken(d.id, "D");
    // Un invitado como destino → 403.
    const g2 = await (await guest(json("http://t/api/v1/guest", { deviceName: "otro" }))).json();
    expect((await merge(json("http://t/x", { guestToken: g.token }, { authorization: `Bearer ${g2.token}` }))).status).toBe(403);
    const ok = await merge(json("http://t/x", { guestToken: g.token }, { authorization: `Bearer ${td.token}` }));
    expect(ok.status).toBe(200); expect((await ok.json()).maps).toBe(1);
    expect((await prisma.clan.findUniqueOrThrow({ where: { id: clan.id } })).createdById).toBe(d.id);
    expect((await me(json("http://t/x", undefined, { authorization: `Bearer ${g.token}` }, "GET"))).status).toBe(401);
    // Repetir con un token que ya no es de invitado → 400.
    expect((await merge(json("http://t/x", { guestToken: td.token }, { authorization: `Bearer ${td.token}` }))).status).toBe(400);
  });
});
```

Run: `npx vitest run tests/db/devices-api.test.ts` — Expected: FAIL (rutas inexistentes).

- [ ] **Step 2: `clientIp` en `src/lib/api-auth.ts`**

```ts
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
```

- [ ] **Step 3: Endpoints**

```ts
// src/app/api/v1/devices/link/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { signLinkCode } from "@/lib/device-tokens";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

const lim = createLimiter({ windowMs: 60_000, max: 10 });

// Solo con sesión web: el QR se enseña en Perfil (spec §5.2, flujo 1).
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  if (!consumeToken(lim, session.user.id).ok) return apiError("RATE_LIMITED", 429, "Demasiados códigos");
  return NextResponse.json({ code: signLinkCode(session.user.id), expiresAt: new Date(Date.now() + 60_000).toISOString() });
}
```

```ts
// src/app/api/v1/devices/claim/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { consumeLinkCode, createDeviceToken } from "@/lib/device-tokens";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

const lim = createLimiter({ windowMs: 60_000, max: 10 });
const schema = z.object({ code: z.string().min(1).max(256), deviceName: z.string().min(1).max(60) }).strict();

// Sin autenticación: el código de un solo uso ES la credencial.
export async function POST(req: Request) {
  if (!consumeToken(lim, clientIp(req)).ok) return apiError("RATE_LIMITED", 429, "Demasiados intentos");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const userId = consumeLinkCode(parsed.data.code);
    if (!userId) return apiError("VALIDATION_ERROR", 400, "Código no válido o caducado");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isGuest: true } });
    if (!user) return apiError("VALIDATION_ERROR", 400, "Código no válido o caducado");
    const { token, deviceId } = await createDeviceToken(user.id, parsed.data.deviceName);
    return NextResponse.json({ token, deviceId, userId: user.id, isGuest: user.isGuest });
  } catch (err) { return internalError(err); }
}
```

```ts
// src/app/api/v1/devices/route.ts
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { listDeviceTokens } from "@/lib/device-tokens";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  return NextResponse.json({ devices: await listDeviceTokens(me.userId) });
}
```

```ts
// src/app/api/v1/devices/[id]/route.ts
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { revokeDeviceToken } from "@/lib/device-tokens";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  if (!(await revokeDeviceToken(me.userId, id))) return apiError("NOT_FOUND", 404, "Dispositivo no encontrado");
  return new NextResponse(null, { status: 204 });
}
```

```ts
// src/app/api/v1/guest/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { createGuestUser } from "@/lib/guest";
import { createDeviceToken } from "@/lib/device-tokens";
import { createLimiter, consumeToken } from "@/lib/rate-limit";

// Invitado desde la app, sin pasar por la web (spec §5.2, flujo 2).
// Mismo límite que las altas de invitado de la web: 5 por IP y hora.
const lim = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
const schema = z.object({ deviceName: z.string().min(1).max(60) }).strict();

export async function POST(req: Request) {
  if (!consumeToken(lim, clientIp(req)).ok) return apiError("RATE_LIMITED", 429, "Demasiadas cuentas nuevas desde esta red");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const guest = await createGuestUser();
    const { token, deviceId } = await createDeviceToken(guest.id, parsed.data.deviceName);
    return NextResponse.json({ token, deviceId, userId: guest.id, isGuest: true }, { status: 201 });
  } catch (err) { return internalError(err); }
}
```

```ts
// src/app/api/v1/me/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const u = await prisma.user.findUnique({ where: { id: me.userId }, select: { id: true, isGuest: true, displayName: true, globalNickname: true, discordUsername: true } });
  if (!u) return apiError("UNAUTHORIZED", 401, "Sesión inválida");
  return NextResponse.json({ id: u.id, isGuest: u.isGuest, name: u.isGuest ? null : (u.displayName ?? u.globalNickname ?? u.discordUsername) });
}
```

```ts
// src/app/api/v1/me/merge/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { verifyDeviceToken } from "@/lib/device-tokens";
import { mergeGuestInto } from "@/lib/guest";

const schema = z.object({ guestToken: z.string().min(10).max(200) }).strict();

// Desde la app: la cuenta Discord (Bearer) absorbe al invitado cuyo token
// se envía en el cuerpo. Exige los DOS tokens válidos (spec §5.2, flujo 3).
export async function POST(req: Request) {
  const me = await getApiUser(req);
  if (!me || me.via !== "device") return apiError("UNAUTHORIZED", 401, "Hace falta el token de dispositivo de la cuenta Discord");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const target = await prisma.user.findUnique({ where: { id: me.userId }, select: { isGuest: true } });
    if (!target || target.isGuest) return apiError("INSUFFICIENT_ROLE", 403, "Entra con Discord para conservar los mapas");
    const guest = await verifyDeviceToken(parsed.data.guestToken);
    if (!guest) return apiError("VALIDATION_ERROR", 400, "Token de invitado no válido");
    const maps = await mergeGuestInto(guest.userId, me.userId);
    const stillGuest = await prisma.user.findUnique({ where: { id: guest.userId }, select: { isGuest: true } });
    if (stillGuest) return apiError("VALIDATION_ERROR", 400, "Ese token no es de una cuenta de invitado");
    return NextResponse.json({ merged: true, maps });
  } catch (err) { return internalError(err); }
}
```

- [ ] **Step 4: Verificar y commit**

Run: `npx vitest run tests/db/devices-api.test.ts && npx tsc --noEmit -p .` — Expected: 4 tests PASS.

```bash
git add src/lib/api-auth.ts src/app/api/v1 tests/db/devices-api.test.ts
git commit -m "api v1: vincular dispositivos, invitado desde la app y fusión con Discord"
```

### Task 5: Página `/link/app` (entrar con Discord desde la app)

**Files:**
- Create: `src/app/link/app/page.tsx`, `src/components/link/LinkApp.tsx`
- Modify: `src/i18n/translations.ts` (claves `link.*` EN y ES)
- Modify: `src/app/robots.ts` (`disallow` `/link/`)

**Interfaces:**
- Consumes: `signLinkCode` (Tarea 3), `auth()`.
- Produces: URL `avalontracker://linked?code=<code>` que la app KMP reclama con `POST /api/v1/devices/claim`.

- [ ] **Step 1: Claves de texto** (en `const en` y `const es` de `translations.ts`)

```ts
  "link.title": "Link the app to your account",
  "link.needDiscord": "Sign in with Discord on this page; the app will pick up the link automatically.",
  "link.ready": "Almost done. Go back to the app to finish. This code expires in 60 seconds.",
  "link.open": "Back to the app",
  "link.copy": "Copy code",
  "link.guest": "You are signed in as a guest. To link the app to a Discord account, sign in with Discord first.",
```
```ts
  "link.title": "Vincular la app a tu cuenta",
  "link.needDiscord": "Entra con Discord en esta página; la app recogerá el vínculo sola.",
  "link.ready": "Casi está. Vuelve a la app para terminar. Este código caduca en 60 segundos.",
  "link.open": "Volver a la app",
  "link.copy": "Copiar código",
  "link.guest": "Estás como invitado. Para vincular la app a una cuenta de Discord, entra antes con Discord.",
```

- [ ] **Step 2: Página y componente**

```tsx
// src/app/link/app/page.tsx
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signLinkCode } from "@/lib/device-tokens";
import { LinkApp } from "@/components/link/LinkApp";

export const metadata: Metadata = { title: "Link the app", robots: { index: false, follow: false } };

// La app abre esta página en el navegador del sistema. Con sesión de
// Discord, emite un código de un solo uso (60 s) y devuelve a la app por
// el esquema avalontracker:// (spec §5.2, flujo 3).
export default async function LinkAppPage() {
  const session = await auth();
  if (!session?.user?.id) return <LinkApp state="signin" />;
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isGuest: true } });
  if (!u || u.isGuest) return <LinkApp state="guest" />;
  return <LinkApp state="ready" code={signLinkCode(session.user.id)} />;
}
```

```tsx
// src/components/link/LinkApp.tsx
"use client";
import { useEffect } from "react";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { keepMapsWithDiscord } from "@/components/map/guest-actions";

export function LinkApp({ state, code }: { state: "signin" | "guest" | "ready"; code?: string }) {
  const { t } = useLanguage();
  const deepLink = code ? `avalontracker://linked?code=${encodeURIComponent(code)}` : null;
  useEffect(() => { if (deepLink) window.location.href = deepLink; }, [deepLink]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
        <h1 className="text-2xl font-bold text-white">{t("link.title")}</h1>
        {state === "signin" && (<>
          <p className="mt-3 text-slate-300">{t("link.needDiscord")}</p>
          <button onClick={() => signIn("discord", { callbackUrl: "/link/app" })} className="mt-5 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white hover:bg-[#4752c4]">{t("landing.cta.signin")}</button>
        </>)}
        {state === "guest" && (<>
          <p className="mt-3 text-slate-300">{t("link.guest")}</p>
          <button onClick={() => keepMapsWithDiscord("/link/app")} className="mt-5 rounded-xl bg-[#5865F2] px-6 py-3 font-semibold text-white hover:bg-[#4752c4]">{t("guest.banner.cta")}</button>
        </>)}
        {state === "ready" && deepLink && (<>
          <p className="mt-3 text-slate-300">{t("link.ready")}</p>
          <a href={deepLink} className="mt-5 inline-block rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500">{t("link.open")}</a>
          <button onClick={() => navigator.clipboard.writeText(code!)} className="mt-3 block w-full text-xs text-slate-400 hover:text-white">{t("link.copy")}</button>
          <code className="mt-2 block break-all text-[10px] text-slate-500">{code}</code>
        </>)}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: `robots.ts`**: en la regla `userAgent: "*"` cambia `disallow: ["/api/", "/dashboard/", "/clan/"]` por `disallow: ["/api/", "/dashboard/", "/clan/", "/link/", "/m/", "/i/"]`.

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit -p . && npx next build 2>&1 | tail -3` — Expected: build OK; `/link/app` aparece como ruta dinámica. Comprobación manual: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/link/app` → 200.

```bash
git add src/app/link src/components/link src/i18n/translations.ts src/app/robots.ts
git commit -m "web: /link/app para vincular la app con la cuenta de Discord"
```

### Task 6: Sincronización por mapa (`src/lib/sync.ts` + `/api/v1/maps/*`)

**Files:**
- Create: `src/lib/sync.ts`, `src/lib/personal-maps.ts`
- Modify: `src/app/api/maps/route.ts` (delega en `createPersonalMap`)
- Create: `src/app/api/v1/maps/route.ts`, `src/app/api/v1/maps/[id]/route.ts`, `src/app/api/v1/maps/[id]/changes/route.ts`
- Test: `tests/db/sync.test.ts`

**Interfaces:**
- Consumes: `getApiUser` (Tarea 3), `requireRole`/`PermissionError`/`permissionErrorMessage` de `src/lib/permissions.ts`, `logAudit`, `MAX_PERSONAL_MAPS` (mover de `src/app/api/maps/route.ts` a `src/lib/personal-maps.ts`).
- Produces:
  - `createPersonalMap(userId: string, anchorZone?: string): Promise<{ id: string; name: string } | { error: "LIMIT" }>`
  - `pullChanges(clanId: string, since: Date | null, limit?: number): Promise<PullResult>` con `PullResult = { routes: RouteRow[]; hops: HopRow[]; serverTime: string; hasMore: boolean; next: string | null }`
  - `applyChanges(clanId: string, userId: string, batch: PushBatch): Promise<PushResult>` con `PushResult = { applied: ChangeKey[]; rejected: { key: ChangeKey; reason: "stale" | "not_in_map"; server?: RouteRow | HopRow }[]; serverTime: string }` · `ChangeKey = { kind: "route"; id: string } | { kind: "hop"; routeId: string; fromZone: string; toZone: string }`
  - `class UnknownZoneError extends Error { zone: string }`
  - Esquemas zod exportados: `pushSchema`, `routeChangeSchema`, `hopChangeSchema`.
  - Endpoints: `GET /api/v1/maps` → `{ maps: [{ id, name, kind, myRole, updatedAt }] }` · `POST /api/v1/maps { anchorZone? }` → 201 `{ id, name }` · `GET /api/v1/maps/{id}` → `{ id, name, kind, myRole, anchorZone, updatedAt }` · `GET /api/v1/maps/{id}/changes?since=&limit=` → `PullResult` · `POST /api/v1/maps/{id}/changes` (cuerpo `PushBatch`) → `PushResult`.

**Nota sobre `portalSize` en sincronización:** la app migra saltos antiguos con tamaño 2; la API de sincronización acepta `2 | 7 | 20 | 40` para **no perder** filas heredadas (espejo de datos), mientras que las interfaces y los endpoints de creación manual (Tarea 2) solo ofrecen 7 y 20.

- [ ] **Step 1: Tests que fallan**

```ts
// tests/db/sync.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";
vi.mock("@/lib/vigil-bot-client", () => ({ fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {} }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
process.env.AUTH_SECRET = "test-secret-for-sync-0123456789abcdefgh";
let db: Awaited<ReturnType<typeof startTestDb>>; let prisma: typeof import("@/lib/prisma").prisma; let dt: typeof import("@/lib/device-tokens");
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; dt = await import("@/lib/device-tokens");
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum", "Coros-Atinaum", "Siros-Ofurlos"]) await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} }); }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
let seq = 0;
async function ownerToken() {
  const u = await prisma.user.create({ data: { discordId: `4000000000000000${++seq}`.slice(0, 18), discordUsername: `s${seq}`, email: `s${seq}@x.test` } });
  const clan = await prisma.clan.create({ data: { name: `sync-${seq}`, kind: "PERSONAL", createdById: u.id } });
  await prisma.clanMember.create({ data: { userId: u.id, clanId: clan.id, appRole: "ADMIN" } });
  const { token } = await dt.createDeviceToken(u.id, "t");
  return { u, clan, token };
}
const req = (url: string, token: string, body?: unknown, method = body === undefined ? "GET" : "POST") =>
  new Request(url, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const uuid = () => crypto.randomUUID();
const inH = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

describe("sincronización", () => {
  it("quien no es miembro no baja ni sube (403)", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const a = await ownerToken(); const b = await ownerToken();
    expect((await GET(req(`http://t/x`, b.token), ctx(a.clan.id))).status).toBe(403);
    expect((await POST(req(`http://t/x`, b.token, { routes: [{ id: uuid() }], hops: [] }), ctx(a.clan.id))).status).toBe(403);
  });

  it("sube ruta y saltos, baja todo y luego nada desde serverTime", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    const push = await POST(req("http://t/x", token, { routes: [{ id, notes: "hola" }], hops: [
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(2) },
      { routeId: id, fromZone: "Hiles-Izizaum", toZone: "Coros-Atinaum", order: 1, portalSize: 2, expiresAt: inH(3) },
    ] }), ctx(clan.id));
    expect(push.status).toBe(200);
    const pr = await push.json(); expect(pr.applied).toHaveLength(3); expect(pr.rejected).toHaveLength(0);
    const all = await (await GET(req("http://t/x", token), ctx(clan.id))).json();
    expect(all.routes.map((r: { id: string }) => r.id)).toEqual([id]);
    expect(all.hops.map((h: { fromZone: string; portalSize: number }) => [h.fromZone, h.portalSize])).toEqual([["Casitos-Atinaum", 7], ["Hiles-Izizaum", 2]]);
    const none = await (await GET(req(`http://t/x?since=${encodeURIComponent(all.serverTime)}`, token), ctx(clan.id))).json();
    expect(none.routes).toHaveLength(0); expect(none.hops).toHaveLength(0);
  });

  it("el servidor manda: base antigua → stale con la fila del servidor; base correcta → aplicado", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    await POST(req("http://t/x", token, { routes: [{ id, notes: "v1" }], hops: [] }), ctx(clan.id));
    const first = await (await GET(req("http://t/x", token), ctx(clan.id))).json();
    const base = first.routes[0].updatedAt;
    await prisma.route.update({ where: { id }, data: { notes: "web" } });
    const stale = await (await POST(req("http://t/x", token, { routes: [{ id, notes: "móvil", baseUpdatedAt: base }], hops: [] }), ctx(clan.id))).json();
    expect(stale.rejected[0].reason).toBe("stale"); expect(stale.rejected[0].server.notes).toBe("web");
    const ok = await (await POST(req("http://t/x", token, { routes: [{ id, notes: "móvil", baseUpdatedAt: stale.rejected[0].server.updatedAt }], hops: [] }), ctx(clan.id))).json();
    expect(ok.applied).toHaveLength(1);
    expect((await prisma.route.findUniqueOrThrow({ where: { id } })).notes).toBe("móvil");
  });

  it("un salto no se cuela en la ruta de otro mapa", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const a = await ownerToken(); const b = await ownerToken();
    const idA = uuid();
    await POST(req("http://t/x", a.token, { routes: [{ id: idA }], hops: [] }), ctx(a.clan.id));
    const r = await (await POST(req("http://t/x", b.token, { routes: [], hops: [{ routeId: idA, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) }] }), ctx(b.clan.id))).json();
    expect(r.rejected[0].reason).toBe("not_in_map");
    expect(await prisma.routeHop.count({ where: { routeId: idA } })).toBe(0);
  });

  it("dos saltos con la misma clave en un lote → uno solo; reenviar el lote no duplica", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    const id = uuid();
    const batch = { routes: [{ id }], hops: [
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) },
      { routeId: id, fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", order: 0, portalSize: 20, expiresAt: inH(2) },
    ] };
    expect((await POST(req("http://t/x", token, batch), ctx(clan.id))).status).toBe(200);
    expect((await POST(req("http://t/x", token, batch), ctx(clan.id))).status).toBe(200);
    const hops = await prisma.routeHop.findMany({ where: { routeId: id } });
    expect(hops).toHaveLength(1); expect(hops[0].portalSize).toBe(20);
    expect(await prisma.route.count({ where: { id } })).toBe(1);
  });

  it("since inválido o futuro → 400; zona desconocida → 400; paginación con limit", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/[id]/changes/route");
    const { clan, token } = await ownerToken();
    expect((await GET(req("http://t/x?since=ayer", token), ctx(clan.id))).status).toBe(400);
    expect((await GET(req(`http://t/x?since=${encodeURIComponent(inH(1))}`, token), ctx(clan.id))).status).toBe(400);
    const id = uuid();
    expect((await POST(req("http://t/x", token, { routes: [{ id }], hops: [{ routeId: id, fromZone: "Nope-Zone", toZone: "Hiles-Izizaum", order: 0, portalSize: 7, expiresAt: inH(1) }] }), ctx(clan.id))).status).toBe(400);
    for (let i = 0; i < 3; i++) await POST(req("http://t/x", token, { routes: [{ id: uuid(), notes: `r${i}` }], hops: [] }), ctx(clan.id));
    const page = await (await GET(req("http://t/x?limit=2", token), ctx(clan.id))).json();
    expect(page.hasMore).toBe(true); expect(page.routes.length).toBeLessThanOrEqual(2); expect(typeof page.next).toBe("string");
    const rest = await (await GET(req(`http://t/x?limit=2&since=${encodeURIComponent(page.next)}`, token), ctx(clan.id))).json();
    expect(page.routes.length + rest.routes.length).toBeGreaterThanOrEqual(4);
  });

  it("listar y crear mapas por API", async () => {
    const { GET, POST } = await import("@/app/api/v1/maps/route");
    const { clan, token } = await ownerToken();
    const list = await (await GET(req("http://t/x", token))).json();
    expect(list.maps.map((m: { id: string }) => m.id)).toContain(clan.id);
    expect((await POST(req("http://t/x", token, {}))).status).toBe(201);
  });
});
```

Run: `npx vitest run tests/db/sync.test.ts` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: `src/lib/personal-maps.ts`** (extraer de `src/app/api/maps/route.ts`)

```ts
// src/lib/personal-maps.ts
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { touchGuest } from "@/lib/guest";
import { Prisma } from "@/generated/prisma/client";

export const MAX_PERSONAL_MAPS = 3;

// Mapa personal: un «clan» de una sola persona, sin Discord ni Vigil.
export async function createPersonalMap(userId: string, anchorZone?: string): Promise<{ id: string; name: string } | { error: "LIMIT" }> {
  const owned = await prisma.clan.count({ where: { createdById: userId, kind: "PERSONAL" } });
  if (owned >= MAX_PERSONAL_MAPS) return { error: "LIMIT" };
  const anchor = anchorZone ? await prisma.zone.findFirst({ where: { name: { equals: anchorZone, mode: "insensitive" } }, select: { id: true } }) : null;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true, globalNickname: true, discordUsername: true, isGuest: true } });
  const who = user.isGuest ? "My" : `${(user.displayName ?? user.globalNickname ?? user.discordUsername).slice(0, 20)}'s`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = `${who} map · ${crypto.randomBytes(3).toString("hex")}`;
    try {
      const clan = await prisma.$transaction(async (tx) => {
        const created = await tx.clan.create({ data: { name, kind: "PERSONAL", createdById: userId, anchorZoneId: anchor?.id ?? null } });
        await tx.clanMember.create({ data: { userId, clanId: created.id, appRole: "ADMIN", roleSource: "personal:owner", lastSyncAt: new Date() } });
        await logAudit(created.id, userId, "CLAN_CREATE", undefined, { name, kind: "PERSONAL" }, tx);
        return created;
      });
      await touchGuest(userId);
      return { id: clan.id, name: clan.name };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("No se pudo generar un nombre libre");
}
```

En `src/app/api/maps/route.ts` deja solo la autenticación por sesión, la validación zod y la llamada: `const r = await createPersonalMap(userId, parsed.data.anchorZone); if ("error" in r) return apiError("VALIDATION_ERROR", 400, \`Máximo ${MAX_PERSONAL_MAPS} mapas personales\`, { limit: MAX_PERSONAL_MAPS }); return NextResponse.json(r, { status: 201 });` (importa `MAX_PERSONAL_MAPS` desde `@/lib/personal-maps` y borra la copia local). Los tests de `tests/db/personal-maps.test.ts` deben seguir en verde.

- [ ] **Step 3: `src/lib/sync.ts`**

```ts
// src/lib/sync.ts
// Sincronización por mapa (spec §6): identidad por id de cliente (rutas) y
// clave natural (saltos); «el servidor manda»: una fila cuyo updatedAt en
// el servidor no coincide con baseUpdatedAt se rechaza como stale.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const PULL_LIMIT = 500;
export const PUSH_LIMIT = 200;

const isoDate = z.string().datetime({ offset: true });
const clientId = z.string().regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{20,30})$/);

export const routeChangeSchema = z.object({
  id: clientId,
  notes: z.string().max(200).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  deletedAt: isoDate.nullable().optional(),
  baseUpdatedAt: isoDate.optional(),
}).strict();

export const hopChangeSchema = z.object({
  routeId: clientId,
  fromZone: z.string().min(1).max(100),
  toZone: z.string().min(1).max(100),
  order: z.number().int().min(0).max(49),
  // Espejo de datos: se aceptan los tamaños heredados (2, 40) para no perder filas.
  portalSize: z.union([z.literal(2), z.literal(7), z.literal(20), z.literal(40)]),
  expiresAt: isoDate,
  status: z.enum(["ACTIVE", "EXPIRED", "COLLAPSED", "WATCHED"]).optional(),
  statusNote: z.string().max(100).nullable().optional(),
  deletedAt: isoDate.nullable().optional(),
  baseUpdatedAt: isoDate.optional(),
}).strict();

export const pushSchema = z.object({
  routes: z.array(routeChangeSchema).max(PUSH_LIMIT).default([]),
  hops: z.array(hopChangeSchema).max(PUSH_LIMIT).default([]),
}).strict().refine((b) => b.routes.length + b.hops.length <= PUSH_LIMIT, { message: `Lote de más de ${PUSH_LIMIT} filas` });

export type PushBatch = z.infer<typeof pushSchema>;
export type ChangeKey = { kind: "route"; id: string } | { kind: "hop"; routeId: string; fromZone: string; toZone: string };
export type RouteRow = { id: string; notes: string | null; status: string; disabledAt: string | null; deletedAt: string | null; createdAt: string; updatedAt: string };
export type HopRow = { id: number; routeId: string; fromZone: string; toZone: string; order: number; portalSize: number; expiresAt: string; status: string; statusNote: string | null; deletedAt: string | null; updatedAt: string };
export type PullResult = { routes: RouteRow[]; hops: HopRow[]; serverTime: string; hasMore: boolean; next: string | null };
export type PushResult = { applied: ChangeKey[]; rejected: { key: ChangeKey; reason: "stale" | "not_in_map"; server?: RouteRow | HopRow }[]; serverTime: string };

export class UnknownZoneError extends Error { constructor(public zone: string) { super(`Zona desconocida: ${zone}`); } }

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const routeRow = (r: { id: string; notes: string | null; status: string; disabledAt: Date | null; deletedAt: Date | null; createdAt: Date; updatedAt: Date }): RouteRow =>
  ({ id: r.id, notes: r.notes, status: r.status, disabledAt: iso(r.disabledAt), deletedAt: iso(r.deletedAt), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() });
const hopRow = (h: { id: number; routeId: string; order: number; portalSize: number; expiresAt: Date; status: string; statusNote: string | null; deletedAt: Date | null; updatedAt: Date; fromZone: { name: string }; toZone: { name: string } }): HopRow =>
  ({ id: h.id, routeId: h.routeId, fromZone: h.fromZone.name, toZone: h.toZone.name, order: h.order, portalSize: h.portalSize, expiresAt: h.expiresAt.toISOString(), status: h.status, statusNote: h.statusNote, deletedAt: iso(h.deletedAt), updatedAt: h.updatedAt.toISOString() });

// Bajada: filas con updatedAt > since, ascendente. Si alguna lista supera
// `limit`, se recorta a las filas anteriores al último instante y `next`
// apunta ahí (el cliente repite con since=next).
export async function pullChanges(clanId: string, since: Date | null, limit = PULL_LIMIT): Promise<PullResult> {
  const serverTime = new Date();
  const changed = since ? { updatedAt: { gt: since } } : {};
  const [routes, hops] = await Promise.all([
    prisma.route.findMany({ where: { clanId, ...changed }, orderBy: { updatedAt: "asc" }, take: limit + 1 }),
    prisma.routeHop.findMany({ where: { route: { clanId }, ...changed }, orderBy: { updatedAt: "asc" }, take: limit + 1, include: { fromZone: { select: { name: true } }, toZone: { select: { name: true } } } }),
  ]);
  const truncated = routes.length > limit || hops.length > limit;
  let next: Date | null = null;
  if (truncated) {
    const cut = (xs: { updatedAt: Date }[]) => (xs.length > limit ? xs[limit - 1].updatedAt : null);
    const candidates = [cut(routes), cut(hops)].filter((d): d is Date => d !== null);
    next = new Date(Math.min(...candidates.map((d) => d.getTime())));
  }
  // Las filas con updatedAt == next se dejan para la página siguiente (since es exclusivo).
  const keep = <T extends { updatedAt: Date }>(xs: T[]) => (next ? xs.filter((x) => x.updatedAt < next!) : xs);
  let keptRoutes = keep(routes), keptHops = keep(hops);
  if (truncated && keptRoutes.length + keptHops.length === 0) { keptRoutes = routes.slice(0, limit); keptHops = hops.slice(0, limit); }
  return { routes: keptRoutes.map(routeRow), hops: keptHops.map(hopRow), serverTime: serverTime.toISOString(), hasMore: truncated, next: next ? next.toISOString() : null };
}

export async function applyChanges(clanId: string, userId: string, batch: PushBatch): Promise<PushResult> {
  const applied: ChangeKey[] = [];
  const rejected: PushResult["rejected"] = [];

  // Zonas por nombre → id (400 si alguna no existe).
  const names = new Set<string>(); for (const h of batch.hops) { names.add(h.fromZone); names.add(h.toZone); }
  const zones = await prisma.zone.findMany({ where: { name: { in: [...names] } }, select: { id: true, name: true } });
  const zoneId = new Map(zones.map((z) => [z.name, z.id]));
  for (const n of names) if (!zoneId.has(n)) throw new UnknownZoneError(n);

  // Dentro de un lote gana la última aparición de cada clave.
  const routesById = new Map(batch.routes.map((r) => [r.id, r]));
  const hopsByKey = new Map(batch.hops.map((h) => [`${h.routeId}|${h.fromZone}|${h.toZone}`, h]));
  const touchedRoutes = new Set<string>();

  for (const r of routesById.values()) {
    const key: ChangeKey = { kind: "route", id: r.id };
    const existing = await prisma.route.findUnique({ where: { id: r.id } });
    if (existing && existing.clanId !== clanId) { rejected.push({ key, reason: "not_in_map" }); continue; }
    if (!existing) {
      const created = await prisma.route.create({ data: { id: r.id, clanId, createdById: userId, notes: r.notes ?? null, status: r.status ?? "ACTIVE", deletedAt: r.deletedAt ? new Date(r.deletedAt) : null } });
      await logAudit(clanId, userId, "ROUTE_CREATE", created.id, { via: "sync" });
      applied.push(key); continue;
    }
    if (!r.baseUpdatedAt || existing.updatedAt.toISOString() !== r.baseUpdatedAt) { rejected.push({ key, reason: "stale", server: routeRow(existing) }); continue; }
    await prisma.route.update({ where: { id: r.id }, data: {
      notes: r.notes === undefined ? undefined : r.notes,
      status: r.status,
      disabledAt: r.status === "DISABLED" ? existing.disabledAt ?? new Date() : r.status === "ACTIVE" ? null : undefined,
      deletedAt: r.deletedAt === undefined ? undefined : r.deletedAt ? new Date(r.deletedAt) : null,
      version: { increment: 1 },
    } });
    touchedRoutes.add(r.id); applied.push(key);
  }

  for (const h of hopsByKey.values()) {
    const key: ChangeKey = { kind: "hop", routeId: h.routeId, fromZone: h.fromZone, toZone: h.toZone };
    const route = await prisma.route.findUnique({ where: { id: h.routeId }, select: { clanId: true } });
    if (!route || route.clanId !== clanId) { rejected.push({ key, reason: "not_in_map" }); continue; }
    const natural = { routeId: h.routeId, fromZoneId: zoneId.get(h.fromZone)!, toZoneId: zoneId.get(h.toZone)! };
    const existing = await prisma.routeHop.findUnique({ where: { routeId_fromZoneId_toZoneId: natural }, include: { fromZone: { select: { name: true } }, toZone: { select: { name: true } } } });
    const data = { order: h.order, portalSize: h.portalSize, expiresAt: new Date(h.expiresAt), status: h.status ?? "ACTIVE", statusNote: h.statusNote ?? null, deletedAt: h.deletedAt ? new Date(h.deletedAt) : null };
    if (!existing) { await prisma.routeHop.create({ data: { ...natural, ...data } }); touchedRoutes.add(h.routeId); applied.push(key); continue; }
    if (!h.baseUpdatedAt || existing.updatedAt.toISOString() !== h.baseUpdatedAt) { rejected.push({ key, reason: "stale", server: hopRow(existing) }); continue; }
    await prisma.routeHop.update({ where: { id: existing.id }, data: { ...data, statusSetById: h.status && h.status !== existing.status ? userId : undefined, statusSetAt: h.status && h.status !== existing.status ? new Date() : undefined } });
    touchedRoutes.add(h.routeId); applied.push(key);
  }

  for (const routeId of touchedRoutes) await logAudit(clanId, userId, "ROUTE_UPDATE", routeId, { via: "sync" });
  return { applied, rejected, serverTime: new Date().toISOString() };
}
```

- [ ] **Step 4: Endpoints**

```ts
// src/app/api/v1/maps/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { createPersonalMap, MAX_PERSONAL_MAPS } from "@/lib/personal-maps";

export async function GET(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const clans = await prisma.clan.findMany({
    where: { members: { some: { userId: me.userId, appRole: { not: null } } } },
    include: { members: { where: { userId: me.userId }, select: { appRole: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ maps: clans.map((c) => ({ id: c.id, name: c.name, kind: c.kind, myRole: c.members[0]?.appRole ?? null, updatedAt: c.updatedAt.toISOString() })) });
}

const createSchema = z.object({ anchorZone: z.string().min(2).max(60).optional() }).strict();

export async function POST(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    const r = await createPersonalMap(me.userId, parsed.data.anchorZone);
    if ("error" in r) return apiError("VALIDATION_ERROR", 400, `Máximo ${MAX_PERSONAL_MAPS} mapas personales`, { limit: MAX_PERSONAL_MAPS });
    return NextResponse.json(r, { status: 201 });
  } catch (err) { return internalError(err); }
}
```

```ts
// src/app/api/v1/maps/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  try {
    const { role } = await requireRole(me.userId, id, "VIEWER", "GET");
    const clan = await prisma.clan.findUnique({ where: { id }, include: { anchorZone: { select: { name: true } } } });
    if (!clan) return apiError("NOT_FOUND", 404, "Mapa no encontrado");
    return NextResponse.json({ id: clan.id, name: clan.name, kind: clan.kind, myRole: role, anchorZone: clan.anchorZone?.name ?? null, updatedAt: clan.updatedAt.toISOString() });
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }
}
```

```ts
// src/app/api/v1/maps/[id]/changes/route.ts
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { pullChanges, applyChanges, pushSchema, UnknownZoneError, PULL_LIMIT } from "@/lib/sync";
import { touchGuest } from "@/lib/guest";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  const url = new URL(req.url);
  let since: Date | null = null;
  const s = url.searchParams.get("since");
  if (s !== null) {
    since = new Date(s);
    if (Number.isNaN(since.getTime()) || since.getTime() > Date.now() + 60_000) return apiError("VALIDATION_ERROR", 400, "since inválido");
  }
  const limitRaw = Number(url.searchParams.get("limit") ?? PULL_LIMIT);
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= PULL_LIMIT ? limitRaw : PULL_LIMIT;
  try {
    await requireRole(me.userId, id, "VIEWER", "GET");
    await touchGuest(me.userId);
    return NextResponse.json(await pullChanges(id, since, limit));
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    return internalError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  const parsed = pushSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Lote inválido", { issues: parsed.error.issues });
  try {
    await requireRole(me.userId, id, "EDITOR", "WRITE");
    await touchGuest(me.userId);
    return NextResponse.json(await applyChanges(id, me.userId, parsed.data));
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    if (e instanceof UnknownZoneError) return apiError("VALIDATION_ERROR", 400, e.message, { zone: e.zone });
    return internalError(e);
  }
}
```

- [ ] **Step 5: Verificar y commit**

Run: `npx vitest run tests/db/sync.test.ts tests/db/personal-maps.test.ts && npx tsc --noEmit -p .` — Expected: todos PASS (los de `personal-maps` siguen en verde tras la extracción).

```bash
git add src/lib/sync.ts src/lib/personal-maps.ts src/app/api/maps/route.ts src/app/api/v1/maps tests/db/sync.test.ts
git commit -m "api v1: mapas y sincronización por mapa (el servidor manda)"
```

### Task 7: Enlaces compartidos (`MapShare`, `src/lib/map-shares.ts`, `/api/v1/maps/{id}/shares`, `/api/v1/shares/{token}`)

**Files:**
- Modify: `prisma/schema.prisma` (modelo `MapShare` + relación en `Clan`)
- Create: `src/lib/map-shares.ts`, `src/lib/map-routes.ts`
- Create: `src/app/api/v1/maps/[id]/shares/route.ts`, `src/app/api/v1/maps/[id]/shares/[shareId]/route.ts`, `src/app/api/v1/shares/[token]/route.ts`, `src/app/api/v1/shares/[token]/join/route.ts`
- Modify: `src/app/api/clans/[clanId]/convert/route.ts` (revoca enlaces al convertir)
- Test: `tests/db/shares.test.ts`

**Interfaces:**
- Consumes: `ROLE_HIERARCHY`, `invalidateRoleCache`, `invalidateClanRoleCache`, `requireRole` de `src/lib/permissions.ts`; `getApiUser`, `clientIp`; `createLimiter`/`consumeToken`.
- Produces:
  - `type ShareRole = "VIEWER" | "EDITOR"`
  - `createShare(clanId, role: ShareRole, createdById): Promise<{ id; role; token; url; createdAt }>` (lanza `ShareError("NOT_PERSONAL", 403)` si el mapa no es PERSONAL)
  - `listShares(clanId): Promise<{ id; role; createdAt }[]>` (no revocados)
  - `revokeShare(clanId, shareId): Promise<boolean>` · `revokeAllShares(clanId): Promise<number>`
  - `verifyShare(token): Promise<{ id; clanId; role: ShareRole } | null>`
  - `joinByShare(token, userId): Promise<{ clanId; role: ShareRole } | null>` (nunca degrada una membresía de rango igual o superior)
  - `loadActiveRoutes(clanId): Promise<{ routes: RouteView[]; now: string }>` en `src/lib/map-routes.ts` (misma forma que `GET /api/clans/{id}/routes`)
  - Endpoints: `POST|GET /api/v1/maps/{id}/shares` · `DELETE /api/v1/maps/{id}/shares/{shareId}` · `GET /api/v1/shares/{token}` → `{ map: { id, name, anchorZone }, role, routes, now }` · `POST /api/v1/shares/{token}/join` → `{ clanId, role }`

- [ ] **Step 1: Esquema**

```prisma
// Enlace compartido de un mapa PERSONAL (ver o editar), revocable. Solo el
// hash SHA-256 del token en BD; la URL lleva el token (spec §5.3).
model MapShare {
  id          String    @id @default(cuid())
  clanId      String
  role        AppRole
  tokenHash   String    @unique
  createdById String
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)
  @@index([clanId])
}
```

En `model Clan` añade `shares MapShare[]`. `npx prisma generate`.

- [ ] **Step 2: Tests que fallan**

```ts
// tests/db/shares.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";
const bot = vi.hoisted(() => ({ fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn() }));
vi.mock("@/lib/vigil-bot-client", () => ({ ...bot, GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {} }));
const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session.current) }));
process.env.AUTH_SECRET = "test-secret-for-shares-0123456789abcdefg";
let db: Awaited<ReturnType<typeof startTestDb>>; let prisma: typeof import("@/lib/prisma").prisma;
let shares: typeof import("@/lib/map-shares"); let perms: typeof import("@/lib/permissions"); let dt: typeof import("@/lib/device-tokens");
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma; shares = await import("@/lib/map-shares"); perms = await import("@/lib/permissions"); dt = await import("@/lib/device-tokens"); }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
let seq = 0;
const user = () => prisma.user.create({ data: { discordId: `5000000000000000${++seq}`.slice(0, 18), discordUsername: `h${seq}`, email: `h${seq}@x.test` } });
async function personalMap(ownerId: string) {
  const clan = await prisma.clan.create({ data: { name: `share-${++seq}`, kind: "PERSONAL", createdById: ownerId } });
  await prisma.clanMember.create({ data: { userId: ownerId, clanId: clan.id, appRole: "ADMIN", roleSource: "personal:owner" } });
  return clan;
}
const req = (url: string, opts: { token?: string; body?: unknown; method?: string; ip?: string } = {}) =>
  new Request(url, { method: opts.method ?? (opts.body === undefined ? "GET" : "POST"), headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "10.1.1.1", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });

describe("enlaces compartidos", () => {
  it("crea ver/editar en un mapa personal; un clan de Discord → 403", async () => {
    const { POST } = await import("@/app/api/v1/maps/[id]/shares/route");
    const owner = await user(); const map = await personalMap(owner.id); const { token } = await dt.createDeviceToken(owner.id, "t");
    const r = await POST(req("http://t/x", { token, body: { role: "EDITOR" } }), { params: Promise.resolve({ id: map.id }) });
    expect(r.status).toBe(201);
    const s = await r.json(); expect(s.url).toMatch(/\/m\/[A-Za-z0-9_-]{22}$/); expect(s.role).toBe("EDITOR");
    const discord = await prisma.clan.create({ data: { name: `d-${seq}`, kind: "DISCORD", discordGuildId: `6000000000000000${seq}`.slice(0, 18), discordGuildName: "G", createdById: owner.id } });
    await prisma.clanMember.create({ data: { userId: owner.id, clanId: discord.id, appRole: "ADMIN", roleSource: "creator:permanent" } });
    bot.fetchUserRoleFromBot.mockResolvedValue({ computedAppRole: "ADMIN", discordRoleIds: [] });
    expect((await POST(req("http://t/x", { token, body: { role: "VIEWER" } }), { params: Promise.resolve({ id: discord.id }) })).status).toBe(403);
  });

  it("ver: el token abre el mapa sin cuenta; revocado → 404; token inventado → 404", async () => {
    const { GET } = await import("@/app/api/v1/shares/[token]/route");
    const owner = await user(); const map = await personalMap(owner.id);
    const s = await shares.createShare(map.id, "VIEWER", owner.id);
    const ok = await GET(req("http://t/x"), { params: Promise.resolve({ token: s.token }) });
    expect(ok.status).toBe(200); expect((await ok.json()).map.id).toBe(map.id);
    expect(await shares.revokeShare(map.id, s.id)).toBe(true);
    expect((await GET(req("http://t/x"), { params: Promise.resolve({ token: s.token }) })).status).toBe(404);
    expect((await GET(req("http://t/x"), { params: Promise.resolve({ token: "A".repeat(22) }) })).status).toBe(404);
  });

  it("unirse: EDITOR da EDITOR (no ADMIN), VIEWER da VIEWER; el dueño no se degrada; revocar expulsa", async () => {
    const owner = await user(); const map = await personalMap(owner.id);
    const edit = await shares.createShare(map.id, "EDITOR", owner.id);
    const view = await shares.createShare(map.id, "VIEWER", owner.id);
    const a = await user(); const b = await user();
    expect(await shares.joinByShare(edit.token, a.id)).toEqual({ clanId: map.id, role: "EDITOR" });
    expect(await shares.joinByShare(view.token, b.id)).toEqual({ clanId: map.id, role: "VIEWER" });
    expect(await shares.joinByShare(view.token, owner.id)).toEqual({ clanId: map.id, role: "VIEWER" });
    expect((await perms.getUserRoleInClan(a.id, map.id)).appRole).toBe("EDITOR");
    expect((await perms.getUserRoleInClan(b.id, map.id)).appRole).toBe("VIEWER");
    expect((await perms.getUserRoleInClan(owner.id, map.id)).appRole).toBe("ADMIN");
    await expect(perms.requireRole(a.id, map.id, "ADMIN", "WRITE")).rejects.toMatchObject({ code: "INSUFFICIENT_ROLE" });
    await shares.revokeShare(map.id, edit.id);
    await expect(perms.requireRole(a.id, map.id, "VIEWER", "GET")).rejects.toMatchObject({ code: "NOT_MEMBER" });
    expect((await perms.getUserRoleInClan(b.id, map.id)).appRole).toBe("VIEWER");
  });

  it("join por API con token de dispositivo y sin cuenta (401)", async () => {
    const { POST } = await import("@/app/api/v1/shares/[token]/join/route");
    const owner = await user(); const map = await personalMap(owner.id);
    const s = await shares.createShare(map.id, "EDITOR", owner.id);
    expect((await POST(req("http://t/x", { method: "POST" }), { params: Promise.resolve({ token: s.token }) })).status).toBe(401);
    const a = await user(); const { token } = await dt.createDeviceToken(a.id, "t");
    const r = await POST(req("http://t/x", { token, method: "POST" }), { params: Promise.resolve({ token: s.token }) });
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ clanId: map.id, role: "EDITOR" });
  });

  it("adivinar tokens: 20 intentos por minuto e IP, el 21.º → 429", async () => {
    const { GET } = await import("@/app/api/v1/shares/[token]/route");
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await GET(req("http://t/x", { ip: "10.9.9.9" }), { params: Promise.resolve({ token: "B".repeat(22) }) })).status;
    expect(last).toBe(429);
  });

  it("convertir un mapa personal en clan revoca sus enlaces y expulsa a los que entraron por ellos", async () => {
    const { POST: convert } = await import("@/app/api/clans/[clanId]/convert/route");
    bot.fetchGuildHealth.mockResolvedValue({ installed: true }); bot.fetchUserGuildPermissions.mockResolvedValue({ canRegisterClan: true });
    const owner = await user(); const map = await personalMap(owner.id);
    const s = await shares.createShare(map.id, "EDITOR", owner.id);
    const a = await user(); await shares.joinByShare(s.token, a.id);
    session.current = { user: { id: owner.id } };
    const r = await convert(new Request("http://t/x", { method: "POST", body: JSON.stringify({ name: `Clan ${seq}`, discordGuildId: `7000000000000000${seq}`.slice(0, 18), discordGuildName: "G" }) }), { params: Promise.resolve({ clanId: map.id }) });
    expect(r.status).toBe(200);
    expect(await shares.listShares(map.id)).toHaveLength(0);
    expect(await prisma.clanMember.findUnique({ where: { userId_clanId: { userId: a.id, clanId: map.id } } })).toBeNull();
  });
});
```

Run: `npx vitest run tests/db/shares.test.ts` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: `src/lib/map-shares.ts` y `src/lib/map-routes.ts`**

```ts
// src/lib/map-shares.ts
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ROLE_HIERARCHY, invalidateRoleCache, invalidateClanRoleCache } from "@/lib/permissions";
import { createLimiter } from "@/lib/rate-limit";
import type { AppRole } from "@/generated/prisma/client";

// Consultas públicas de enlaces (endpoint y página /m): 20 por minuto e IP.
export const shareLookupLimiter = createLimiter({ windowMs: 60_000, max: 20 });

export type ShareRole = "VIEWER" | "EDITOR";
export const SITE_URL = "https://avalontracker.app";
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/; // 16 bytes en base64url = 128 bits

export class ShareError extends Error {
  constructor(public code: "NOT_PERSONAL" | "NOT_FOUND", public status: number, message: string) { super(message); }
}

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const shareUrl = (token: string) => `${SITE_URL}/m/${token}`;

export async function createShare(clanId: string, role: ShareRole, createdById: string) {
  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { kind: true } });
  if (!clan) throw new ShareError("NOT_FOUND", 404, "Mapa no encontrado");
  if (clan.kind !== "PERSONAL") throw new ShareError("NOT_PERSONAL", 403, "Los clanes de Discord no se comparten por enlace");
  const token = crypto.randomBytes(16).toString("base64url");
  const row = await prisma.mapShare.create({ data: { clanId, role, tokenHash: hash(token), createdById }, select: { id: true, role: true, createdAt: true } });
  return { id: row.id, role: row.role as ShareRole, token, url: shareUrl(token), createdAt: row.createdAt.toISOString() };
}

export async function listShares(clanId: string) {
  const rows = await prisma.mapShare.findMany({ where: { clanId, revokedAt: null }, select: { id: true, role: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, role: r.role as ShareRole, createdAt: r.createdAt.toISOString() }));
}

// Revocar = marcar y BORRAR las membresías que nacieron de ese enlace.
export async function revokeShare(clanId: string, shareId: string): Promise<boolean> {
  const r = await prisma.mapShare.updateMany({ where: { id: shareId, clanId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (r.count === 0) return false;
  await prisma.clanMember.deleteMany({ where: { clanId, roleSource: `share:${shareId}` } });
  invalidateClanRoleCache(clanId);
  return true;
}

export async function revokeAllShares(clanId: string): Promise<number> {
  const active = await prisma.mapShare.findMany({ where: { clanId, revokedAt: null }, select: { id: true } });
  for (const s of active) await revokeShare(clanId, s.id);
  return active.length;
}

export async function verifyShare(token: string | undefined) {
  if (!token || !TOKEN_RE.test(token)) return null;
  const row = await prisma.mapShare.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, clanId: true, role: true, revokedAt: true, clan: { select: { kind: true } } } });
  if (!row || row.revokedAt || row.clan.kind !== "PERSONAL") return null;
  return { id: row.id, clanId: row.clanId, role: row.role as ShareRole };
}

// Unirse por enlace: crea la membresía con el rol del enlace; si ya había
// una de rango igual o superior (p. ej. el dueño), no la toca.
export async function joinByShare(token: string, userId: string) {
  const share = await verifyShare(token);
  if (!share) return null;
  const existing = await prisma.clanMember.findUnique({ where: { userId_clanId: { userId, clanId: share.clanId } }, select: { appRole: true } });
  const keep = existing?.appRole && ROLE_HIERARCHY[existing.appRole as AppRole] >= ROLE_HIERARCHY[share.role];
  if (!keep) {
    await prisma.clanMember.upsert({
      where: { userId_clanId: { userId, clanId: share.clanId } },
      create: { userId, clanId: share.clanId, appRole: share.role, roleSource: `share:${share.id}`, lastSyncAt: new Date() },
      update: { appRole: share.role, roleSource: `share:${share.id}`, lastSyncAt: new Date() },
    });
    invalidateRoleCache(userId, share.clanId);
  }
  // Se devuelve el rol del enlace; el rol efectivo lo da getUserRoleInClan.
  return { clanId: share.clanId, role: share.role };
}
```

```ts
// src/lib/map-routes.ts
import { prisma } from "@/lib/prisma";

// Rutas activas con saltos vivos, en la misma forma que GET /api/clans/{id}/routes
// (sin los barridos de mantenimiento). Para /m/<token> y la API de enlaces.
export async function loadActiveRoutes(clanId: string) {
  const now = new Date();
  const routes = await prisma.route.findMany({
    where: { clanId, status: "ACTIVE", deletedAt: null },
    include: {
      hops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { fromZone: true, toZone: true } },
      createdBy: { select: { id: true, discordUsername: true, globalNickname: true, displayName: true, discordAvatar: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return { routes, now: now.toISOString() };
}
```

- [ ] **Step 4: Endpoints**

```ts
// src/app/api/v1/maps/[id]/shares/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { createShare, listShares, ShareError } from "@/lib/map-shares";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ role: z.enum(["VIEWER", "EDITOR"]) }).strict();

export async function GET(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  try { await requireRole(me.userId, id, "ADMIN", "GET"); return NextResponse.json({ shares: await listShares(id) }); }
  catch (e) { if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra); return internalError(e); }
}

export async function POST(req: Request, { params }: Ctx) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  try {
    await requireRole(me.userId, id, "ADMIN", "WRITE");
    const share = await createShare(id, parsed.data.role, me.userId);
    await logAudit(id, me.userId, "SETTINGS_CHANGE", share.id, { share: "create", role: share.role });
    return NextResponse.json(share, { status: 201 });
  } catch (e) {
    if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra);
    if (e instanceof ShareError) return apiError(e.code === "NOT_FOUND" ? "NOT_FOUND" : "INSUFFICIENT_ROLE", e.status, e.message);
    return internalError(e);
  }
}
```

```ts
// src/app/api/v1/maps/[id]/shares/[shareId]/route.ts
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { requireRole, PermissionError, permissionErrorMessage } from "@/lib/permissions";
import { revokeShare } from "@/lib/map-shares";
import { logAudit } from "@/lib/audit";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { id, shareId } = await params;
  try {
    await requireRole(me.userId, id, "ADMIN", "WRITE");
    if (!(await revokeShare(id, shareId))) return apiError("NOT_FOUND", 404, "Enlace no encontrado");
    await logAudit(id, me.userId, "SETTINGS_CHANGE", shareId, { share: "revoke" });
    return new NextResponse(null, { status: 204 });
  } catch (e) { if (e instanceof PermissionError) return apiError(e.code, e.status, permissionErrorMessage(e), e.extra); return internalError(e); }
}
```

```ts
// src/app/api/v1/shares/[token]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, internalError } from "@/lib/api-error";
import { clientIp } from "@/lib/api-auth";
import { verifyShare, shareLookupLimiter } from "@/lib/map-shares";
import { loadActiveRoutes } from "@/lib/map-routes";
import { consumeToken } from "@/lib/rate-limit";

// Público: el token es el secreto. 20 consultas por minuto e IP frenan
// cualquier intento de adivinar (2^128 posibilidades).

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!consumeToken(shareLookupLimiter, clientIp(req)).ok) return apiError("RATE_LIMITED", 429, "Demasiados intentos");
  const { token } = await params;
  try {
    const share = await verifyShare(token);
    if (!share) return apiError("NOT_FOUND", 404, "Enlace no válido");
    const clan = await prisma.clan.findUniqueOrThrow({ where: { id: share.clanId }, include: { anchorZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true } } } });
    const { routes, now } = await loadActiveRoutes(share.clanId);
    return NextResponse.json({ map: { id: clan.id, name: clan.name, anchorZone: clan.anchorZone }, role: share.role, routes, now });
  } catch (e) { return internalError(e); }
}
```

```ts
// src/app/api/v1/shares/[token]/join/route.ts
import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { joinByShare } from "@/lib/map-shares";
import { touchGuest } from "@/lib/guest";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const { token } = await params;
  try {
    const joined = await joinByShare(token, me.userId);
    if (!joined) return apiError("NOT_FOUND", 404, "Enlace no válido");
    await touchGuest(me.userId);
    await logAudit(joined.clanId, me.userId, "MEMBER_ROLE_SYNCED", undefined, { via: "share", role: joined.role });
    return NextResponse.json(joined);
  } catch (e) { return internalError(e); }
}
```

En `src/app/api/clans/[clanId]/convert/route.ts`, justo antes de `const updated = await prisma.$transaction(...)`, añade `await revokeAllShares(clanId);` (importa `revokeAllShares` de `@/lib/map-shares`). Ya después de la transacción se llama a `invalidateClanRoleCache(clanId)`.

- [ ] **Step 5: Verificar y commit**

Run: `npx vitest run tests/db/shares.test.ts tests/db/personal-maps.test.ts && npx tsc --noEmit -p .` — Expected: todos PASS.

```bash
git add prisma/schema.prisma src/lib/map-shares.ts src/lib/map-routes.ts src/app/api/v1 src/app/api/clans/\[clanId\]/convert/route.ts tests/db/shares.test.ts
git commit -m "enlaces compartidos de mapas personales: ver/editar, revocables, con límite por IP"
```

### Task 8: Página `/m/<token>` (mapa compartido, ver sin cuenta / editar uniéndose)

**Files:**
- Create: `src/app/m/[token]/page.tsx`, `src/components/share/SharedMap.tsx`
- Modify: `src/i18n/translations.ts` (claves `share.*` EN y ES)

**Interfaces:**
- Consumes: `verifyShare`, `shareLookupLimiter` (de `src/lib/map-shares.ts`, ver nota), `loadActiveRoutes`, `ClanGraph` (`src/components/graph/ClanGraph.tsx`), `RouteView`, `ClanAnchorZone` (`src/hooks/useClan.ts`), `signIn("guest")`.
- Produces: la página pública del enlace; el botón «Unirme» llama a `POST /api/v1/shares/{token}/join`.

**Nota:** el limitador `shareLookupLimiter` se define en `src/lib/map-shares.ts` (`export const shareLookupLimiter = createLimiter({ windowMs: 60_000, max: 20 });`) y lo importan tanto el endpoint de la Tarea 7 como esta página (no se importa desde un fichero de ruta).

- [ ] **Step 1: Claves de texto** (EN / ES)

```ts
  "share.title": "Shared map",
  "share.readonly": "Read-only view. Timers update every 30 seconds.",
  "share.role.VIEWER": "view link",
  "share.role.EDITOR": "edit link",
  "share.join.edit": "Edit this map",
  "share.join.save": "Keep it in my account",
  "share.join.hint": "No account needed: a guest account is created on this browser.",
  "share.empty": "This map has no active routes yet.",
```
```ts
  "share.title": "Mapa compartido",
  "share.readonly": "Solo lectura. Los tiempos se actualizan cada 30 segundos.",
  "share.role.VIEWER": "enlace de ver",
  "share.role.EDITOR": "enlace de editar",
  "share.join.edit": "Editar este mapa",
  "share.join.save": "Guardarlo en mi cuenta",
  "share.join.hint": "Sin cuenta: se crea una de invitado en este navegador.",
  "share.empty": "Este mapa aún no tiene rutas activas.",
```

- [ ] **Step 2: Página (servidor)**

```tsx
// src/app/m/[token]/page.tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyShare, shareLookupLimiter } from "@/lib/map-shares";
import { loadActiveRoutes } from "@/lib/map-routes";
import { consumeToken } from "@/lib/rate-limit";
import { SharedMap } from "@/components/share/SharedMap";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const share = await verifyShare((await params).token);
  const clan = share ? await prisma.clan.findUnique({ where: { id: share.clanId }, select: { name: true } }) : null;
  return { title: clan ? `${clan.name} · shared map` : "Shared map", robots: { index: false, follow: false } };
}

// Enlace de ver: el mapa en solo lectura sin cuenta. Enlace de editar:
// vista previa y botón para unirse (spec §5.3). Mismo límite por IP que
// la API para que adivinar tokens no salga gratis.
export default async function SharedMapPage({ params }: Props) {
  const { token } = await params;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!consumeToken(shareLookupLimiter, ip).ok) notFound();
  const share = await verifyShare(token);
  if (!share) notFound();
  const clan = await prisma.clan.findUniqueOrThrow({
    where: { id: share.clanId },
    include: { anchorZone: { select: { id: true, name: true, type: true, tier: true, hasHideout: true, isRest: true, isCapital: true } } },
  });
  const initial = await loadActiveRoutes(share.clanId);
  return <SharedMap token={token} role={share.role} map={{ id: clan.id, name: clan.name, anchorZone: clan.anchorZone }} initial={initial} />;
}
```

- [ ] **Step 3: Componente (cliente)**

```tsx
// src/components/share/SharedMap.tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { signIn } from "next-auth/react";
import { ClanGraph } from "@/components/graph/ClanGraph";
import type { RouteView } from "@/hooks/useClanRoutes";
import type { ClanAnchorZone } from "@/hooks/useClan";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ShareRole } from "@/lib/map-shares";

type Payload = { map: { id: string; name: string; anchorZone: ClanAnchorZone | null }; role: ShareRole; routes: RouteView[]; now: string };

export function SharedMap({ token, role, map, initial }: { token: string; role: ShareRole; map: Payload["map"]; initial: { routes: RouteView[]; now: string } }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useSWR<Payload>(`/api/v1/shares/${token}`, { fallbackData: { map, role, ...initial }, refreshInterval: 30_000, revalidateOnFocus: true });
  const routes = data?.routes ?? initial.routes;

  async function join() {
    setBusy(true); setError(null);
    try {
      let r = await fetch(`/api/v1/shares/${token}/join`, { method: "POST" });
      if (r.status === 401) {
        const s = await signIn("guest", { redirect: false });
        if (!s || s.error) { setError(t("map.start.rate")); return; }
        r = await fetch(`/api/v1/shares/${token}/join`, { method: "POST" });
      }
      if (!r.ok) { setError(t("toast.error")); return; }
      const { clanId } = await r.json();
      router.push(`/clan/${clanId}`); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-3">
        <Link href="/" className="mr-auto font-semibold text-white">🌀 Avalon Tracker</Link>
        <span className="text-sm text-slate-400">{t("share.title")} · <strong className="text-white">{map.name}</strong> · {t(`share.role.${role}`)}</span>
        <button onClick={join} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
          {role === "EDITOR" ? t("share.join.edit") : t("share.join.save")}
        </button>
      </header>
      <p className="px-4 pt-2 text-xs text-slate-500">{t("share.readonly")} {t("share.join.hint")}</p>
      {error && <p role="alert" className="px-4 pt-2 text-sm text-red-300">{error}</p>}
      <div className="m-4 flex h-[70vh] min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-800">
        {routes.length === 0 ? <p className="p-6 text-slate-400">{t("share.empty")}</p> : (
          <ClanGraph clanId={`share:${token}`} routes={routes} anchor={map.anchorZone} onNodeClick={() => {}} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar y commit**

Run: `npx tsc --noEmit -p . && npx next build 2>&1 | grep -E "m/\[token\]|error"` — Expected: la ruta `/m/[token]` compila. Prueba manual en dev (`npx next dev -p 3100`): crea un enlace con `curl -X POST -H "Authorization: Bearer <token>" -d '{"role":"VIEWER"}' localhost:3100/api/v1/maps/<id>/shares` y abre la URL en una ventana privada → grafo en solo lectura; URL inventada → 404.

```bash
git add src/app/m src/components/share/SharedMap.tsx src/lib/map-shares.ts src/i18n/translations.ts
git commit -m "web: /m/<token>, mapa compartido en solo lectura y unión por enlace"
```

### Task 9: Códigos de ruta v1 (`/i/<código>` y `POST /api/v1/import`)

**Files:**
- Create: `src/lib/route-codec.ts`, `src/app/api/v1/import/route.ts`, `src/app/i/[code]/page.tsx`, `src/components/share/ImportRoute.tsx`
- Modify: `src/i18n/translations.ts` (claves `import.*` EN y ES)
- Test: `tests/lib/route-codec.test.ts`, `tests/db/import.test.ts`

**Interfaces:**
- Consumes: `createPersonalMap` (Tarea 6), `getApiUser`, `signIn("guest")`.
- Produces:
  - `decodeRouteCode(raw: string): { ok: true; route: SharedRoute } | { ok: false; reason: "invalid" | "unsupported_version" | "too_big" }`
  - `encodeRouteCode(route: SharedRoute): string` (mismo formato que la app: JSON compacto → gzip → base64url sin `=`)
  - `extractCode(raw: string): string` (acepta código pelado, `avalontracker://r/<code>` y `https://avalontracker.app/i/<code>`)
  - `type SharedRoute = { notes?: string; hops: { fromZone: string; toZone: string; portalSize: number; expiresAt: Date; status: "ACTIVE" | "EXPIRED" | "COLLAPSED" | "WATCHED"; statusNote?: string }[] }`
  - `POST /api/v1/import { code }` → 201 `{ clanId, routeId }`

Formato v1 (de `lib/core/share/route_codec.dart` de la app): `{ "v": 1, "n"?: notas, "h": [{ "f": origen, "t": destino, "s": tamaño, "e": caducidad en ms UTC, "st"?: "A"|"E"|"C"|"W" (ausente = A), "sn"?: nota }] }`.

- [ ] **Step 1: Tests del codec (puros)**

```ts
// tests/lib/route-codec.test.ts
import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { decodeRouteCode, encodeRouteCode, extractCode } from "@/lib/route-codec";

const b64u = (b: Buffer) => b.toString("base64url").replace(/=+$/, "");
const flutterLike = (payload: unknown) => b64u(gzipSync(Buffer.from(JSON.stringify(payload))));

describe("route codec v1", () => {
  it("decodifica un código con la forma exacta de la app", () => {
    const e = Date.now() + 3600e3;
    const r = decodeRouteCode(flutterLike({ v: 1, n: "ojo gankers", h: [{ f: "Casitos-Atinaum", t: "Hiles-Izizaum", s: 7, e }, { f: "Hiles-Izizaum", t: "Coros-Atinaum", s: 20, e: e + 1000, st: "W", sn: "vigilado" }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.notes).toBe("ojo gankers");
    expect(r.route.hops.map((h) => [h.fromZone, h.portalSize, h.status])).toEqual([["Casitos-Atinaum", 7, "ACTIVE"], ["Hiles-Izizaum", 20, "WATCHED"]]);
    expect(r.route.hops[1].statusNote).toBe("vigilado");
    expect(r.route.hops[0].expiresAt.getTime()).toBe(e);
  });
  it("ida y vuelta", () => {
    const route = { notes: "x", hops: [{ fromZone: "A-B", toZone: "C-D", portalSize: 7, expiresAt: new Date(1_800_000_000_000), status: "COLLAPSED" as const, statusNote: "n" }] };
    const r = decodeRouteCode(encodeRouteCode(route));
    expect(r.ok && r.route).toEqual(route);
  });
  it("acepta enlaces completos", () => {
    const code = encodeRouteCode({ hops: [{ fromZone: "A", toZone: "B", portalSize: 7, expiresAt: new Date(1_800_000_000_000), status: "ACTIVE" }] });
    expect(extractCode(`avalontracker://r/${code}`)).toBe(code);
    expect(extractCode(`https://avalontracker.app/i/${code}`)).toBe(code);
    expect(extractCode(`  ${code}\n`)).toBe(code);
  });
  it("rechaza basura, versión desconocida y bombas de descompresión", () => {
    expect(decodeRouteCode("no-es-base64!!")).toEqual({ ok: false, reason: "invalid" });
    expect(decodeRouteCode(b64u(Buffer.from("hola")))).toEqual({ ok: false, reason: "invalid" });
    expect(decodeRouteCode(flutterLike({ v: 2, h: [] }))).toEqual({ ok: false, reason: "unsupported_version" });
    expect(decodeRouteCode(flutterLike({ v: 1, h: [] }))).toEqual({ ok: false, reason: "invalid" });
    expect(decodeRouteCode(b64u(gzipSync(Buffer.alloc(5 * 1024 * 1024, 0x20))))).toEqual({ ok: false, reason: "too_big" });
  });
});
```

Run: `npx vitest run tests/lib/route-codec.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Codec**

```ts
// src/lib/route-codec.ts
import { gunzipSync, gzipSync } from "node:zlib";
import { z } from "zod";

export const ROUTE_CODE_VERSION = 1;
export const MAX_DECODED_BYTES = 64 * 1024;
export type HopStatus = "ACTIVE" | "EXPIRED" | "COLLAPSED" | "WATCHED";
export type SharedHop = { fromZone: string; toZone: string; portalSize: number; expiresAt: Date; status: HopStatus; statusNote?: string };
export type SharedRoute = { notes?: string; hops: SharedHop[] };
export type DecodeResult = { ok: true; route: SharedRoute } | { ok: false; reason: "invalid" | "unsupported_version" | "too_big" };

const STATUS_BY_CODE: Record<string, HopStatus> = { A: "ACTIVE", E: "EXPIRED", C: "COLLAPSED", W: "WATCHED" };
const CODE_BY_STATUS: Record<HopStatus, string> = { ACTIVE: "A", EXPIRED: "E", COLLAPSED: "C", WATCHED: "W" };

const payloadSchema = z.object({
  v: z.number().int(),
  n: z.string().max(200).optional(),
  h: z.array(z.object({
    f: z.string().min(1).max(100), t: z.string().min(1).max(100),
    s: z.number().int().min(1).max(100), e: z.number().int().positive(),
    st: z.enum(["A", "E", "C", "W"]).optional(), sn: z.string().max(100).optional(),
  })).min(1).max(50),
}).strict();

// Acepta el código pelado, el deep link o la URL web.
export function extractCode(raw: string): string {
  const s = raw.trim();
  if (/^(avalontracker:\/\/|https?:\/\/)/i.test(s)) return s.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  return s;
}

export function decodeRouteCode(raw: string): DecodeResult {
  const code = extractCode(raw);
  if (!/^[A-Za-z0-9_-]{8,8000}$/.test(code)) return { ok: false, reason: "invalid" };
  let json: unknown;
  try {
    const bytes = gunzipSync(Buffer.from(code, "base64url"), { maxOutputLength: MAX_DECODED_BYTES });
    json = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    return { ok: false, reason: (e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? "too_big" : "invalid" };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    const v = (json as { v?: unknown })?.v;
    return { ok: false, reason: typeof v === "number" && v !== ROUTE_CODE_VERSION ? "unsupported_version" : "invalid" };
  }
  if (parsed.data.v !== ROUTE_CODE_VERSION) return { ok: false, reason: "unsupported_version" };
  return { ok: true, route: {
    ...(parsed.data.n ? { notes: parsed.data.n } : {}),
    hops: parsed.data.h.map((h) => ({ fromZone: h.f, toZone: h.t, portalSize: h.s, expiresAt: new Date(h.e), status: STATUS_BY_CODE[h.st ?? "A"], ...(h.sn ? { statusNote: h.sn } : {}) })),
  } };
}

export function encodeRouteCode(route: SharedRoute): string {
  const payload = {
    v: ROUTE_CODE_VERSION,
    ...(route.notes?.trim() ? { n: route.notes.trim() } : {}),
    h: route.hops.map((h) => ({ f: h.fromZone, t: h.toZone, s: h.portalSize, e: h.expiresAt.getTime(), ...(h.status !== "ACTIVE" ? { st: CODE_BY_STATUS[h.status] } : {}), ...(h.statusNote?.trim() ? { sn: h.statusNote.trim() } : {}) })),
  };
  return gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64url").replace(/=+$/, "");
}
```

`zod` con `v: 2` y `h: []` falla por `min(1)` antes que por la versión; el orden de comprobación del test lo cubre porque el `safeParse` falla y `v !== 1` → `unsupported_version`. Con `v: 1, h: []` → `invalid`.

- [ ] **Step 3: Test de la importación**

```ts
// tests/db/import.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { startTestDb } from "./setup";
vi.mock("@/lib/vigil-bot-client", () => ({ fetchUserRoleFromBot: vi.fn(), fetchGuildHealth: vi.fn(), fetchUserGuildPermissions: vi.fn(),
  GuildOrMemberNotFoundError: class extends Error {}, BotUnavailableError: class extends Error {} }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
process.env.AUTH_SECRET = "test-secret-for-import-0123456789abcdefg";
let db: Awaited<ReturnType<typeof startTestDb>>; let prisma: typeof import("@/lib/prisma").prisma;
beforeAll(async () => { db = await startTestDb(); prisma = (await import("@/lib/prisma")).prisma;
  for (const n of ["Casitos-Atinaum", "Hiles-Izizaum"]) await prisma.zone.upsert({ where: { name: n }, create: { name: n, type: "AVALON", tier: 6 }, update: {} }); }, 120_000);
afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });

it("importa a un mapa personal (lo crea si no hay) y reutiliza el mismo mapa después; zona desconocida → 400", async () => {
  const { POST } = await import("@/app/api/v1/import/route");
  const { encodeRouteCode } = await import("@/lib/route-codec");
  const dt = await import("@/lib/device-tokens");
  const u = await prisma.user.create({ data: { discordId: "800000000000000001", discordUsername: "i", email: "i@x.test" } });
  const { token } = await dt.createDeviceToken(u.id, "t");
  const code = encodeRouteCode({ hops: [{ fromZone: "Casitos-Atinaum", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(Date.now() + 3600e3), status: "ACTIVE" }] });
  const post = (c: string) => POST(new Request("http://t/x", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ code: c }) }));
  const r1 = await post(code); expect(r1.status).toBe(201);
  const { clanId } = await r1.json();
  const r2 = await post(code); expect((await r2.json()).clanId).toBe(clanId);
  expect(await prisma.route.count({ where: { clanId } })).toBe(2);
  const bad = encodeRouteCode({ hops: [{ fromZone: "Nope-Zone", toZone: "Hiles-Izizaum", portalSize: 7, expiresAt: new Date(Date.now() + 3600e3), status: "ACTIVE" }] });
  expect((await post(bad)).status).toBe(400);
});
```

- [ ] **Step 4: Endpoint de importación**

```ts
// src/app/api/v1/import/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { apiError, internalError } from "@/lib/api-error";
import { decodeRouteCode } from "@/lib/route-codec";
import { createPersonalMap, MAX_PERSONAL_MAPS } from "@/lib/personal-maps";
import { logAudit } from "@/lib/audit";
import { touchGuest } from "@/lib/guest";

const schema = z.object({ code: z.string().min(8).max(8000) }).strict();

// Importa una ruta compartida por código v1 al primer mapa personal del
// usuario (lo crea si no tiene). Los saltos se guardan tal cual, incluidos
// los caducados: la papelera y los tiempos ya los tratan como en la web.
export async function POST(req: Request) {
  const me = await getApiUser(req);
  if (!me) return apiError("UNAUTHORIZED", 401, "Inicia sesión");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", 400, "Datos inválidos", { issues: parsed.error.issues });
  const decoded = decodeRouteCode(parsed.data.code);
  if (!decoded.ok) return apiError("VALIDATION_ERROR", 400, decoded.reason === "unsupported_version" ? "Este código es de una versión más nueva de la app" : "Código no válido");
  try {
    const names = [...new Set(decoded.route.hops.flatMap((h) => [h.fromZone, h.toZone]))];
    const zones = await prisma.zone.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
    const zoneId = new Map(zones.map((z) => [z.name, z.id]));
    const missing = names.find((n) => !zoneId.has(n));
    if (missing) return apiError("VALIDATION_ERROR", 400, `Zona desconocida: ${missing}`, { zone: missing });

    let map = await prisma.clan.findFirst({ where: { createdById: me.userId, kind: "PERSONAL" }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    if (!map) {
      const created = await createPersonalMap(me.userId);
      if ("error" in created) return apiError("VALIDATION_ERROR", 400, `Máximo ${MAX_PERSONAL_MAPS} mapas personales`);
      map = { id: created.id };
    }
    const seen = new Set<string>();
    const hops = decoded.route.hops.filter((h) => { const k = `${h.fromZone}>${h.toZone}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const route = await prisma.route.create({ data: {
      clanId: map.id, createdById: me.userId, notes: decoded.route.notes ?? null,
      hops: { create: hops.map((h, i) => ({ order: i, fromZoneId: zoneId.get(h.fromZone)!, toZoneId: zoneId.get(h.toZone)!, portalSize: h.portalSize, expiresAt: h.expiresAt, status: h.status, statusNote: h.statusNote ?? null })) },
    }, select: { id: true } });
    await logAudit(map.id, me.userId, "ROUTE_CREATE", route.id, { via: "import", hopCount: hops.length });
    await touchGuest(me.userId);
    return NextResponse.json({ clanId: map.id, routeId: route.id }, { status: 201 });
  } catch (err) { return internalError(err); }
}
```

- [ ] **Step 5: Página `/i/<código>` y componente**

Claves EN / ES:
```ts
  "import.title": "Route shared with you",
  "import.expiresIn": "closes in {time}",
  "import.expired": "closed",
  "import.openApp": "Open in the app",
  "import.add": "Add to my map",
  "import.hint": "No account needed: a guest account is created on this browser. Sign in with Discord later to keep it everywhere.",
  "import.invalid": "This code is not valid.",
  "import.newer": "This code comes from a newer version of the app.",
```
```ts
  "import.title": "Ruta compartida contigo",
  "import.expiresIn": "cierra en {time}",
  "import.expired": "cerrado",
  "import.openApp": "Abrir en la app",
  "import.add": "Añadir a mi mapa",
  "import.hint": "Sin cuenta: se crea una de invitado en este navegador. Entra con Discord más tarde para tenerla en todas partes.",
  "import.invalid": "Este código no es válido.",
  "import.newer": "Este código viene de una versión más nueva de la app.",
```

```tsx
// src/app/i/[code]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decodeRouteCode } from "@/lib/route-codec";
import { ImportRoute } from "@/components/share/ImportRoute";

export const metadata: Metadata = { title: "Shared route", robots: { index: false, follow: false } };

// Enlaces https://avalontracker.app/i/<código> que ya genera la app (spec §8).
export default async function ImportPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const decoded = decodeRouteCode(decodeURIComponent(code));
  if (!decoded.ok && decoded.reason !== "unsupported_version") notFound();
  const hops = decoded.ok ? decoded.route.hops.map((h) => ({ ...h, expiresAt: h.expiresAt.toISOString() })) : [];
  return <ImportRoute code={decodeURIComponent(code)} notes={decoded.ok ? decoded.route.notes ?? null : null} hops={hops} unsupported={!decoded.ok} />;
}
```

```tsx
// src/components/share/ImportRoute.tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";

type Hop = { fromZone: string; toZone: string; portalSize: number; expiresAt: string; status: string; statusNote?: string };

function remaining(iso: string, now: number): string | null {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ImportRoute({ code, notes, hops, unsupported }: { code: string; notes: string | null; hops: Hop[]; unsupported: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);

  async function add() {
    setBusy(true); setError(null);
    try {
      const body = JSON.stringify({ code });
      const post = () => fetch("/api/v1/import", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      let r = await post();
      if (r.status === 401) {
        const s = await signIn("guest", { redirect: false });
        if (!s || s.error) { setError(t("map.start.rate")); return; }
        r = await post();
      }
      if (!r.ok) { setError(t("toast.error")); return; }
      const { clanId } = await r.json();
      router.push(`/clan/${clanId}`); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <Link href="/" className="text-sm text-slate-400 hover:text-white">🌀 Avalon Tracker</Link>
        <h1 className="mt-3 text-2xl font-bold text-white">{t("import.title")}</h1>
        {unsupported ? <p className="mt-4 text-slate-300">{t("import.newer")}</p> : (<>
          {notes && <p className="mt-2 text-sm text-slate-400">{notes}</p>}
          <ol className="mt-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
            {hops.map((h, i) => { const left = remaining(h.expiresAt, now); return (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="text-white">{h.fromZone} → {h.toZone}</span>
                <span className="rounded bg-slate-800 px-1.5 text-xs text-slate-300">{h.portalSize}p</span>
                <span className={`ml-auto text-xs ${left ? "text-emerald-300" : "text-red-300"}`}>{left ? t("import.expiresIn", { time: left }) : t("import.expired")}</span>
              </li>); })}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={`avalontracker://r/${encodeURIComponent(code)}`} className="rounded-lg border border-indigo-500/60 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/20">{t("import.openApp")}</a>
            <button onClick={add} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">{t("import.add")}</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t("import.hint")}</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        </>)}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verificar y commit**

Run: `npx vitest run tests/lib/route-codec.test.ts tests/db/import.test.ts && npx tsc --noEmit -p .` — Expected: PASS. Manual en dev: genera un código con `npx tsx -e 'import {encodeRouteCode} from "./src/lib/route-codec"; console.log(encodeRouteCode({hops:[{fromZone:"Casitos-Atinaum",toZone:"Hiles-Izizaum",portalSize:7,expiresAt:new Date(Date.now()+3600e3),status:"ACTIVE"}]}))'`, abre `localhost:3100/i/<código>` → 200 con la ruta; `localhost:3100/i/basura` → 404.

```bash
git add src/lib/route-codec.ts src/app/api/v1/import src/app/i src/components/share/ImportRoute.tsx src/i18n/translations.ts tests/lib/route-codec.test.ts tests/db/import.test.ts
git commit -m "web: /i/<código> importa rutas compartidas por la app (formato v1)"
```

### Task 10: Ficheros `.well-known` (Universal Links y App Links)

**Files:**
- Create: `src/app/.well-known/apple-app-site-association/route.ts`, `src/app/.well-known/assetlinks.json/route.ts`
- Modify: `.env.example` (variable `ANDROID_SIGNING_SHA256`)
- Test: `tests/lib/well-known.test.ts`

**Interfaces:**
- Produces: `GET /.well-known/apple-app-site-association` → JSON `applinks` para `2JE586S3VM.com.crintechstudios.avalontracker` con `paths: ["/m/*", "/i/*"]` · `GET /.well-known/assetlinks.json` → `[]` sin variable, o la declaración `delegate_permission/common.handle_all_urls` para `com.crintechstudios.avalontracker` con las huellas de `ANDROID_SIGNING_SHA256` (separadas por comas).

La huella SHA-256 es la del **certificado de firma de la app en Play** (Play Console → Configuración → Firma de la app → «Certificado de clave de firma de la app» → SHA-256), no la de la clave de subida. La pone Crinlorite en las variables de Coolify; hasta entonces el fichero devuelve `[]` (válido, sin App Links).

- [ ] **Step 1: Tests**

```ts
// tests/lib/well-known.test.ts
import { describe, it, expect, afterEach } from "vitest";

describe(".well-known", () => {
  afterEach(() => { delete process.env.ANDROID_SIGNING_SHA256; });
  it("AASA declara la app y las rutas /m y /i", async () => {
    const { GET } = await import("@/app/.well-known/apple-app-site-association/route");
    const r = await GET();
    expect(r.headers.get("content-type")).toContain("application/json");
    const j = await r.json();
    expect(j.applinks.details[0]).toEqual({ appID: "2JE586S3VM.com.crintechstudios.avalontracker", paths: ["/m/*", "/i/*"] });
  });
  it("assetlinks vacío sin variable y con huellas cuando la hay", async () => {
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    expect(await (await GET()).json()).toEqual([]);
    process.env.ANDROID_SIGNING_SHA256 = "AA:BB:CC, DD:EE:FF";
    const j = await (await GET()).json();
    expect(j[0].target.package_name).toBe("com.crintechstudios.avalontracker");
    expect(j[0].target.sha256_cert_fingerprints).toEqual(["AA:BB:CC", "DD:EE:FF"]);
  });
});
```

Run: `npx vitest run tests/lib/well-known.test.ts` — Expected: FAIL.

- [ ] **Step 2: Handlers**

```ts
// src/app/.well-known/apple-app-site-association/route.ts
import { NextResponse } from "next/server";

// Universal Links (iOS): /m/<token> y /i/<código> abren la app si está
// instalada (spec §8). Equipo de distribución 2JE586S3VM.
export function GET() {
  return NextResponse.json(
    { applinks: { apps: [], details: [{ appID: "2JE586S3VM.com.crintechstudios.avalontracker", paths: ["/m/*", "/i/*"] }] } },
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
  );
}
```

```ts
// src/app/.well-known/assetlinks.json/route.ts
import { NextResponse } from "next/server";

// App Links (Android). Las huellas SHA-256 del certificado de firma de Play
// llegan por ANDROID_SIGNING_SHA256 (separadas por comas).
export function GET() {
  const fingerprints = (process.env.ANDROID_SIGNING_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = fingerprints.length === 0 ? [] : [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "com.crintechstudios.avalontracker", sha256_cert_fingerprints: fingerprints },
  }];
  return NextResponse.json(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } });
}
```

En `.env.example` añade al final:

```
# === Enlaces de app (Android App Links) ===
# Huella(s) SHA-256 del certificado de firma de la app en Play Console
# (Configuración → Firma de la app). Separadas por comas. Vacío = sin App Links.
ANDROID_SIGNING_SHA256=
```

- [ ] **Step 3: Verificar y commit**

Run: `npx vitest run tests/lib/well-known.test.ts && npx tsc --noEmit -p .` — Expected: PASS. Manual en dev: `curl -si localhost:3100/.well-known/apple-app-site-association | head -3` → `200` y `content-type: application/json`.

```bash
git add src/app/.well-known .env.example tests/lib/well-known.test.ts
git commit -m "web: apple-app-site-association y assetlinks.json para /m y /i"
```

### Task 11: Interfaz web — enlaces del mapa y dispositivos del perfil

**Files:**
- Modify: `package.json` (añade `qrcode` y `@types/qrcode`)
- Create: `src/components/clan/ShareLinksPanel.tsx`, `src/components/profile/DevicesPanel.tsx`
- Modify: `src/app/(auth)/clan/[clanId]/settings/page.tsx` (sección «Compartir por enlace» en mapas PERSONAL, junto a la de convertir), `src/app/(auth)/profile/page.tsx` (sección «Dispositivos»)
- Modify: `src/i18n/translations.ts` (claves `shareLinks.*` y `devices.*` EN y ES)

**Interfaces:**
- Consumes: `GET|POST /api/v1/maps/{id}/shares`, `DELETE /api/v1/maps/{id}/shares/{shareId}`, `GET /api/v1/devices`, `DELETE /api/v1/devices/{id}`, `POST /api/v1/devices/link` (todos con la sesión web: `getApiUser` cae a la sesión cuando no hay Bearer).

- [ ] **Step 1: Dependencia**

Run: `npm i qrcode && npm i -D @types/qrcode` — Expected: `package.json` con `"qrcode": "^1.5.x"`.

- [ ] **Step 2: Claves de texto** (EN / ES)

```ts
  "shareLinks.title": "Share by link",
  "shareLinks.help": "A view link shows the map read-only to anyone who has it. An edit link lets them add and change routes. Revoke a link to cut access for everyone who used it.",
  "shareLinks.newView": "New view link",
  "shareLinks.newEdit": "New edit link",
  "shareLinks.copied": "Link copied",
  "shareLinks.once": "Copy it now: for safety the link is only shown once.",
  "shareLinks.revoke": "Revoke",
  "shareLinks.empty": "No links yet.",
  "shareLinks.created": "Created {date}",
  "devices.title": "Devices",
  "devices.help": "Devices linked to this account can sync your maps. Revoke one if you lose it.",
  "devices.link": "Link a device",
  "devices.scan": "Scan this code with the app within 60 seconds.",
  "devices.newCode": "New code",
  "devices.revoke": "Revoke",
  "devices.empty": "No linked devices.",
  "devices.lastUsed": "last used {date}",
  "devices.never": "never used",
```
```ts
  "shareLinks.title": "Compartir por enlace",
  "shareLinks.help": "Un enlace de ver enseña el mapa en solo lectura a quien lo tenga. Uno de editar permite añadir y cambiar rutas. Revocar un enlace corta el acceso a todos los que entraron con él.",
  "shareLinks.newView": "Nuevo enlace de ver",
  "shareLinks.newEdit": "Nuevo enlace de editar",
  "shareLinks.copied": "Enlace copiado",
  "shareLinks.once": "Cópialo ahora: por seguridad el enlace solo se enseña una vez.",
  "shareLinks.revoke": "Revocar",
  "shareLinks.empty": "Aún no hay enlaces.",
  "shareLinks.created": "Creado el {date}",
  "devices.title": "Dispositivos",
  "devices.help": "Los dispositivos vinculados a esta cuenta sincronizan tus mapas. Revoca uno si lo pierdes.",
  "devices.link": "Vincular un dispositivo",
  "devices.scan": "Escanea este código con la app antes de 60 segundos.",
  "devices.newCode": "Nuevo código",
  "devices.revoke": "Revocar",
  "devices.empty": "Sin dispositivos vinculados.",
  "devices.lastUsed": "último uso {date}",
  "devices.never": "sin usar",
```

- [ ] **Step 3: Panel de enlaces**

```tsx
// src/components/clan/ShareLinksPanel.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

type Share = { id: string; role: "VIEWER" | "EDITOR"; createdAt: string };

export function ShareLinksPanel({ clanId }: { clanId: string }) {
  const { t, lang } = useLanguage();
  const { data, mutate } = useSWR<{ shares: Share[] }>(`/api/v1/maps/${clanId}/shares`);
  const [fresh, setFresh] = useState<{ id: string; url: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(role: "VIEWER" | "EDITOR") {
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/maps/${clanId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error?.message ?? t("toast.error"));
      setFresh({ id: body.id, url: body.url, role: body.role });
      await navigator.clipboard.writeText(body.url).then(() => toast.success(t("shareLinks.copied"))).catch(() => undefined);
      mutate();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("toast.error")); } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/v1/maps/${clanId}/shares/${id}`, { method: "DELETE" });
    if (r.ok) { if (fresh?.id === id) setFresh(null); mutate(); } else toast.error(t("toast.error"));
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{t("shareLinks.help")}</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => create("VIEWER")} className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600 disabled:opacity-50">{t("shareLinks.newView")}</button>
        <button disabled={busy} onClick={() => create("EDITOR")} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 disabled:opacity-50">{t("shareLinks.newEdit")}</button>
      </div>
      {fresh && (
        <div className="rounded border border-indigo-700/60 bg-indigo-950/30 p-3 text-sm">
          <p className="text-slate-300">{t("shareLinks.once")}</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={fresh.url} className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-white" onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard.writeText(fresh.url).then(() => toast.success(t("shareLinks.copied")))} className="rounded bg-slate-700 px-2 text-xs text-white">⧉</button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {(data?.shares ?? []).length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("shareLinks.empty")}</li>}
        {(data?.shares ?? []).map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-xs ${s.role === "EDITOR" ? "bg-indigo-900 text-indigo-200" : "bg-slate-800 text-slate-300"}`}>{t(`share.role.${s.role}`)}</span>
            <span className="text-slate-400">{t("shareLinks.created", { date: fmt(s.createdAt) })}</span>
            <button onClick={() => revoke(s.id)} className="ml-auto text-xs text-red-300 hover:text-red-200">{t("shareLinks.revoke")}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

En `settings/page.tsx`, dentro del bloque `clan.kind === "PERSONAL" ? (...)`, antes de la sección de convertir, añade:

```tsx
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <ShareLinksHeading />
          <ShareLinksPanel clanId={clanId} />
        </section>
```

con `import { ShareLinksPanel } from "@/components/clan/ShareLinksPanel";` y, junto a `ConvertHeading`, `function ShareLinksHeading() { const { t } = useLanguage(); return <h2 className="mb-3 text-lg font-semibold text-white">{t("shareLinks.title")}</h2>; }`. Para que el bloque devuelva dos secciones, envuélvelas en un fragmento `<>...</>`.

- [ ] **Step 4: Panel de dispositivos**

```tsx
// src/components/profile/DevicesPanel.tsx
"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import QRCode from "qrcode";
import toast from "react-hot-toast";
import { useLanguage } from "@/contexts/LanguageContext";

type Device = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export function DevicesPanel() {
  const { t, lang } = useLanguage();
  const { data, mutate } = useSWR<{ devices: Device[] }>("/api/v1/devices");
  const [qr, setQr] = useState<{ dataUrl: string; expiresAt: number } | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!qr) return;
    const id = setInterval(() => { const s = Math.max(0, Math.ceil((qr.expiresAt - Date.now()) / 1000)); setLeft(s); if (s === 0) setQr(null); }, 500);
    return () => clearInterval(id);
  }, [qr]);

  async function link() {
    const r = await fetch("/api/v1/devices/link", { method: "POST" });
    if (!r.ok) { toast.error(t("toast.error")); return; }
    const { code, expiresAt } = await r.json();
    setQr({ dataUrl: await QRCode.toDataURL(code, { margin: 1, width: 240 }), expiresAt: new Date(expiresAt).getTime() });
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/v1/devices/${id}`, { method: "DELETE" });
    if (r.ok) mutate(); else toast.error(t("toast.error"));
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{t("devices.help")}</p>
      {qr ? (
        <div className="flex flex-col items-center gap-2 rounded border border-slate-800 bg-slate-950 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr.dataUrl} alt="" width={240} height={240} className="rounded bg-white p-2" />
          <p className="text-sm text-slate-300">{t("devices.scan")} <span className="font-mono text-slate-500">{left}s</span></p>
          <button onClick={link} className="text-xs text-indigo-300 hover:text-indigo-200">{t("devices.newCode")}</button>
        </div>
      ) : (
        <button onClick={link} className="rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500">{t("devices.link")}</button>
      )}
      <ul className="divide-y divide-slate-800 rounded border border-slate-800">
        {(data?.devices ?? []).length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t("devices.empty")}</li>}
        {(data?.devices ?? []).map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="text-white">{d.name}</span>
            <span className="text-xs text-slate-500">{d.lastUsedAt ? t("devices.lastUsed", { date: fmt(d.lastUsedAt) }) : t("devices.never")}</span>
            <button onClick={() => revoke(d.id)} className="ml-auto text-xs text-red-300 hover:text-red-200">{t("devices.revoke")}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

En `profile/page.tsx`, tras la sección del nombre visible, añade:

```tsx
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-white">{t("devices.title")}</h2>
        <DevicesPanel />
      </section>
```

con `import { DevicesPanel } from "@/components/profile/DevicesPanel";`.

- [ ] **Step 5: Verificar y commit**

Run: `npx tsc --noEmit -p . && npx eslint src/components/clan/ShareLinksPanel.tsx src/components/profile/DevicesPanel.tsx "src/app/(auth)/profile/page.tsx" "src/app/(auth)/clan/[clanId]/settings/page.tsx"` — Expected: sin errores. Manual en dev: Perfil → «Vincular un dispositivo» muestra un QR con cuenta atrás; Ajustes de un mapa personal → crear enlace de ver → se copia y aparece en la lista → revocar lo quita.

```bash
git add package.json package-lock.json src/components/clan/ShareLinksPanel.tsx src/components/profile/DevicesPanel.tsx "src/app/(auth)" src/i18n/translations.ts
git commit -m "web: enlaces compartidos en ajustes del mapa y dispositivos en el perfil"
```

### Task 12: Verificación final, documentación y entrega

**Files:**
- Modify: `README.md`, `README.en.md` (sección «API v1» y enlaces compartidos)
- Test: suite completa + humo Playwright

- [ ] **Step 1: Documentar la API v1 en los dos README** (bajo «API Endpoints (resumen)» / «API Endpoints (summary)»):

```markdown
### API v1 (app móvil y enlaces) — sesión web o `Authorization: Bearer <token de dispositivo>`
- `POST /api/v1/devices/link` (sesión) · `POST /api/v1/devices/claim` · `GET /api/v1/devices` · `DELETE /api/v1/devices/:id`
- `POST /api/v1/guest` · `GET /api/v1/me` · `POST /api/v1/me/merge`
- `GET|POST /api/v1/maps` · `GET /api/v1/maps/:id` · `GET|POST /api/v1/maps/:id/changes` (sincronización: el servidor manda)
- `GET|POST /api/v1/maps/:id/shares` · `DELETE /api/v1/maps/:id/shares/:shareId` · `GET /api/v1/shares/:token` · `POST /api/v1/shares/:token/join`
- `POST /api/v1/import` (código v1 de la app)
```

- [ ] **Step 2: Suite completa, lint y build**

Run: `npx tsc --noEmit -p . && npx eslint src tests --quiet; npx vitest run && npm run build 2>&1 | tail -3`
Expected: 0 errores nuevos de lint (los 6 previos no cuentan), todos los tests PASS, build OK.

- [ ] **Step 3: Mutación de guardas (deben fallar tests al romperlas; restaurar después)**

1. En `revokeShare` comenta el `clanMember.deleteMany` → debe fallar «revocar expulsa» en `tests/db/shares.test.ts`.
2. En `applyChanges` cambia la comparación de `baseUpdatedAt` por `true` → debe fallar «el servidor manda» en `tests/db/sync.test.ts`.
3. En `createShare` quita la comprobación `kind !== "PERSONAL"` → debe fallar «un clan de Discord → 403».

Run tras cada rotura: `npx vitest run tests/db/shares.test.ts tests/db/sync.test.ts` — Expected: FAIL en el test indicado; después `git checkout -- src/lib` y PASS.

- [ ] **Step 4: Humo Playwright contra el build de producción local** (`npx next start -p 3200` con `.env.local`; guion en `docs/superpowers/plans/smoke-fase1.mjs`, no versionado):

Flujos y resultados esperados:
1. `/zones/casitos-atinaum` → «Start a free map» → «Create my map» → mapa creado (invitado).
2. Ajustes del mapa → «Nuevo enlace de ver» → URL `/m/<token>`; en un contexto nuevo (sin cookies) la URL muestra el grafo en solo lectura; `/m/<token con una letra cambiada>` → 404.
3. «Nuevo enlace de editar» → en otro contexto, «Editar este mapa» → aterriza en `/clan/<id>` con rol EDITOR (puede crear ruta por `POST /api/clans/<id>/routes`, no puede `DELETE /api/clans/<id>`).
4. Revocar el enlace de editar → el segundo contexto recibe 403 en `/api/clans/<id>/routes`.
5. `/i/<código generado con encodeRouteCode>` → «Añadir a mi mapa» → ruta visible en el mapa; `/i/basura` → 404.
6. Perfil → «Vincular un dispositivo» → leer el código del QR (decodificar la imagen con `jsqr` en el guion, o exponerlo en `data-code` del `<img>` durante la prueba) → `POST /api/v1/devices/claim` → `GET /api/v1/maps` con Bearer lista el mapa.
7. `/.well-known/apple-app-site-association` → 200 JSON; `/link/app` sin sesión → 200 con botón de Discord.

- [ ] **Step 5: Commit final y entrega**

```bash
git add README.md README.en.md
git commit -m "docs: API v1, enlaces compartidos y dispositivos"
git push origin main   # no despliega
```

Después: pedir a Crinlorite (a) el OK de despliegue, (b) la huella `ANDROID_SIGNING_SHA256` de Play Console para las variables de Coolify. Desplegar solo con su OK (`POST /api/v1/deploy?uuid=0eut397j7vvnvb5dqvjugtlk` desde el contenedor `coolify`) y verificar en producción los mismos siete flujos del humo.

---

## Autorrevisión del plan (hecha al escribirlo)

- **Cobertura de la spec, fase 1 (§12.1):** `Route.deletedAt` + 7 días (T1) · tamaños 7/20 (T2) · `DeviceToken` y vínculo (T3, T4, T11) · `MapShare` y enlaces (T7, T8, T11) · API v1 dispositivos/mapas/cambios/enlaces/importación (T4, T6, T7, T9) · `/m`, `/i`, `/link/app` (T5, T8, T9) · AASA y assetlinks (T10) · UI de compartir y dispositivos (T11) · `robots` (T5). Fusión invitado→Discord desde la app (T4). Conversión revoca enlaces (T7).
- **Review Focus → tests:** 1 → T7 («el dueño no se degrada») · 2 → T6 («dos saltos con la misma clave») · 3 → T4 («el código no se reutiliza») · 4 → T9 («bombas de descompresión») · 5 → T6 («since inválido o futuro»).
- **Consistencia de nombres:** `getApiUser`/`clientIp` (T3/T4) usados en T6, T7, T9; `createPersonalMap` (T6) usado en T9; `shareLookupLimiter` vive en `src/lib/map-shares.ts` y lo importan T7 y T8; `loadActiveRoutes` (T7) usado en T8; `TRASH_TTL_MS` (T1) usado en trash/rutas.
