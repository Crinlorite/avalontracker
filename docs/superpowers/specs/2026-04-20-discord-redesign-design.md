# Avalon Tracker — Rediseño Discord + Sharing + Pathfinding

**Fecha:** 2026-04-20
**Estado:** Spec validado, pendiente de plan de implementación
**Autor:** Crint (diseño colaborativo con Claude)

---

## 1. Resumen ejecutivo

Rediseño completo de autenticación, permisos, modelo de colaboración y UI primaria de Avalon Tracker. Reemplaza el sistema actual de credenciales + Google OAuth (pendiente) + códigos de invitación por:

- **Autenticación Discord OAuth** con scopes mínimos (`identify`, `email`).
- **Vigil Bot como dependencia obligatoria** — fuente de autoridad para roles Discord, metadata de guilds y notificaciones.
- **4 roles jerárquicos** con mapeo many-to-many desde roles Discord (el más alto gana).
- **Grafo interactivo estilo Tripwire/Pathfinder** como vista primaria, con lista como fallback en móvil vertical.
- **Pathfinding precomputado** (nearest royal city + nearest rest) mejorado sobre el existente.
- **Super admin en modo observador fantasma** sin audit trail.

Migración: big-bang con `prisma migrate reset` — la app no tiene usuarios reales en prod todavía.

Monetización: fuera del código. Se canaliza a través del producto Vigil Bot (freemium/paid). Avalon Tracker queda gratis y sin lógica de billing.

---

## 2. Glosario

| Término | Definición |
|---|---|
| **Clan** | Organización de jugadores mapeada 1:1 a un Discord guild |
| **Guild** | Servidor de Discord |
| **Hop** | Tramo individual de una ruta (portal entre dos zonas) |
| **Ruta / Route** | Cadena de 1-12 hops consecutivos |
| **Anchor zone** | Zona "home" del clan (típicamente HO Avalon o zona negra), centro del grafo |
| **Rest** | Zona Avalon con estación de descanso |
| **Vigil Bot** | Bot Discord propio, autoridad de roles y canal de notificaciones |
| **Super admin** | Usuario con acceso global de solo-lectura, silencioso, definido por env var |

---

## 3. Roles y permisos

### Jerarquía (numérica, mayor > menor)

| Nivel | Enum | UI en español | Intent |
|:-:|---|---|---|
| 4 | `ADMIN` | Admin | Gestiona clan, mapeo de roles, webhooks, borra rutas |
| 3 | `EDITOR` | Editor | Crear + editar + borrar rutas |
| 2 | `CONTRIBUTOR` | Colaborador | Crear + editar (sin borrar) |
| 1 | `VIEWER` | Observador | Solo lectura |

### Matriz de permisos

| Acción | Admin | Editor | Colaborador | Observador |
|---|:-:|:-:|:-:|:-:|
| Ver rutas, grafo, lista | ✅ | ✅ | ✅ | ✅ |
| Ver info de zona y pathfinding | ✅ | ✅ | ✅ | ✅ |
| Crear ruta | ✅ | ✅ | ✅ | ❌ |
| Editar ruta (propia o ajena) | ✅ | ✅ | ✅ | ❌ |
| Cambiar estado de hop (ACTIVE/COLLAPSED/WATCHED) | ✅ | ✅ | ✅ | ❌ |
| Deshabilitar ruta (soft-delete) | ✅ | ✅ | ✅ | ❌ |
| Borrar ruta (hard-delete) | ✅ | ✅ | ❌ | ❌ |
| Borrar hop individual | ✅ | ✅ | ❌ | ❌ |
| Enviar ruta a Discord manualmente | ✅ | ✅ | ✅ | ❌ |
| Ver audit log | ✅ | ❌ | ❌ | ❌ |
| Configurar clan (nombre, webhook, anchor, mapeo roles) | ✅ | ❌ | ❌ | ❌ |
| Borrar clan | ✅ | ❌ | ❌ | ❌ |

### Super admin

- Marcado por env var `SUPER_ADMIN_DISCORD_IDS="id1,id2,..."`.
- En **clanes propios** (tiene `ClanMember.appRole != null`): permisos de su rol Discord normal.
- En **clanes ajenos**: solo lectura (GET). Cualquier POST/PATCH/DELETE → 403. Sin audit trail.
- Resoluciones específicas en código:
  - `requireRoleOrSuperAdminRead(userId, clanId, minRole, method)` helper.
  - `logAudit()` detecta `user.isSuperAdmin && !isMember(user, clan)` y no escribe.

### Mapeo Discord → App role

- Modelo many-to-many: `ClanRoleMapping(clanId, discordRoleId, appRole)` sin `@@unique([clanId, appRole])`.
- Un clan puede mapear 0-N roles Discord a cada `appRole`.
- Resolución en login/sync: `user.discordRoles ∩ mappings` → `appRole = max(role por jerarquía)`.
- Si no hay match → `appRole = null` → no acceso.

---

## 4. Arquitectura general

```
┌──────────────────────────────────────────────┐
│  Browser (React 19)                          │
│  - react-flow graph (primary view)           │
│  - SWR polling 10-15s visible, 60s bg        │
│  - Socket.io client (solo route-expired)     │
└──────────┬───────────────────────────────────┘
           │ HTTPS (cookie authjs JWT)
┌──────────▼───────────────────────────────────┐
│  Next.js 16 server (Coolify / VPS Hetzner)   │
│  - App Router + API routes                   │
│  - NextAuth v5 + Discord provider            │
│  - Middleware Edge: gate auth + superadmin   │
│  - LRU cache roles (30 min TTL)              │
│  - Circuit breaker hacia Vigil Bot           │
│  - Socket.io server (solo expiración)        │
└────┬─────────────────────────────┬───────────┘
     │                             │
┌────▼────────┐        ┌───────────▼──────────┐
│ PostgreSQL  │        │ Vigil Bot (Coolify)  │
│ PrismaPg    │        │ - discord.js gateway │
│ pool max 5  │        │ - Express API        │
└─────────────┘        │ - autoridad roles    │
                       │ - push notifs        │
                       └──────────────────────┘
                                  │
                                  ▼
                           Discord API
```

**Stack**:
- Next.js 16 App Router, React 19, Tailwind v4
- NextAuth v5 (Credentials → Discord)
- Prisma v7 + PrismaPg adapter + PostgreSQL
- `@xyflow/react` (react-flow) para grafo
- SWR para data fetching con polling
- `socket.io` (conservado para route-expired)
- `pino` para logs JSON estructurados
- `lru-cache` para rate limit y role cache

---

## 5. Data model (Prisma schema)

### Enums nuevos

```prisma
enum AppRole {
  VIEWER
  CONTRIBUTOR
  EDITOR
  ADMIN
}

enum RouteHopStatus {
  ACTIVE
  EXPIRED
  COLLAPSED
  WATCHED
}

// enum RouteStatus permanece: ACTIVE | EXPIRED | DISABLED
// enum ZoneType permanece: AVALON | ROYAL | OUTLANDS
```

### User

```prisma
model User {
  id               String   @id @default(cuid())
  discordId        String   @unique
  discordUsername  String
  discordAvatar    String?
  globalNickname   String?
  email            String   @unique     // nunca renderizar en UI
  displayName      String?              // override opcional mostrado en UI
  image            String?              // avatar URL derivado de discordAvatar
  isSuperAdmin     Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  accounts         Account[]
  sessions         Session[]
  clanMembers      ClanMember[]
  routesCreated    Route[]  @relation("RouteCreator")
  routesDisabled   Route[]  @relation("RouteDisabler")
  auditLogs        AuditLog[]
}
```

**Eliminados**: `googleId`, `personalCode`, `emailVerified`.

### Clan

```prisma
model Clan {
  id                 String   @id @default(cuid())
  name               String   @unique
  discordGuildId     String   @unique
  discordGuildName   String
  discordGuildIcon   String?
  discordWebhookUrl  String?
  anchorZoneId       Int?                        // hideout u otra zona inicial
  botInstalled       Boolean  @default(false)    // hook neutro para futuro
  tier               String?                     // hook neutro para monetización
  createdById        String
  createdAt          DateTime @default(now())

  createdBy          User     @relation(fields: [createdById], references: [id])
  anchorZone         Zone?    @relation("ClanAnchor", fields: [anchorZoneId], references: [id])
  members            ClanMember[]
  routes             Route[]
  auditLogs          AuditLog[]
  roleMappings       ClanRoleMapping[]
}
```

### ClanRoleMapping (nuevo)

```prisma
model ClanRoleMapping {
  id               Int     @id @default(autoincrement())
  clanId           String
  discordRoleId    String
  discordRoleName  String  // snapshot, refrescable
  appRole          AppRole

  clan             Clan    @relation(fields: [clanId], references: [id], onDelete: Cascade)

  @@unique([clanId, discordRoleId])
  @@index([clanId])
}
```

### ClanMember (modificado)

```prisma
model ClanMember {
  id          Int       @id @default(autoincrement())
  userId      String
  clanId      String
  appRole     AppRole?                  // null = sin acceso actual
  roleSource  String?                   // "discord:role_ids[...]"
  lastSyncAt  DateTime?
  joinedAt    DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id])
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)

  @@unique([userId, clanId])
  @@index([clanId])
}
```

**Eliminados**: `role` (reemplazado por `appRole`), `invitedById`.

### Zone (enriquecida)

```prisma
model Zone {
  id           Int         @id @default(autoincrement())
  name         String      @unique
  type         ZoneType
  tier         Int?                             // 4, 6, 8 para Avalon; otros para royal/outlands
  hasHideout   Boolean     @default(false)
  hasDungeon   Boolean     @default(false)
  isRest       Boolean     @default(false)      // true = rest station Avalon
  isCapital    Boolean     @default(false)      // true = capital city royal
  rawData      Json?                            // resources/chests/dungeons detallado

  connectionsFrom   ZoneConnection[]  @relation("ConnectionFrom")
  connectionsTo     ZoneConnection[]  @relation("ConnectionTo")
  routingFrom       ZoneRouting?      @relation("RoutingFrom")
  routingRoyalRef   ZoneRouting[]     @relation("RoutingRoyal")
  routingRestRef    ZoneRouting[]     @relation("RoutingRest")
  clanAnchorFor     Clan[]            @relation("ClanAnchor")
  hopsFrom          RouteHop[]        @relation("HopFrom")
  hopsTo            RouteHop[]        @relation("HopTo")

  @@index([name])
  @@index([type])
  @@index([tier])
}
```

### ZoneConnection (nuevo)

```prisma
model ZoneConnection {
  id             Int      @id @default(autoincrement())
  fromZoneId     Int
  toZoneId       Int
  connectionType String                        // ROYAL_ROAD | AVALON_STATIC | AVALON_TO_ROYAL | OUTLANDS_ROAD

  fromZone       Zone     @relation("ConnectionFrom", fields: [fromZoneId], references: [id])
  toZone         Zone     @relation("ConnectionTo",   fields: [toZoneId],   references: [id])

  @@unique([fromZoneId, toZoneId])
  @@index([fromZoneId])
}
```

### ZoneRouting (nuevo — pathfinding precomputado)

```prisma
model ZoneRouting {
  zoneId              Int       @id
  nearestRoyalZoneId  Int?
  hopsToRoyal         Int?
  nearestRestZoneId   Int?
  hopsToRest          Int?
  computedAt          DateTime  @default(now())

  zone                Zone      @relation("RoutingFrom", fields: [zoneId],             references: [id])
  nearestRoyal        Zone?     @relation("RoutingRoyal", fields: [nearestRoyalZoneId], references: [id])
  nearestRest         Zone?     @relation("RoutingRest",  fields: [nearestRestZoneId],  references: [id])
}
```

### Route (añadidos)

```prisma
model Route {
  id            String        @id @default(cuid())
  clanId        String
  createdById   String
  disabledById  String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  disabledAt    DateTime?
  status        RouteStatus   @default(ACTIVE)
  notes         String?                         // máx 200 chars
  version       Int           @default(1)       // optimistic concurrency

  clan          Clan          @relation(fields: [clanId], references: [id])
  createdBy     User          @relation("RouteCreator",  fields: [createdById],  references: [id])
  disabledBy    User?         @relation("RouteDisabler", fields: [disabledById], references: [id])
  hops          RouteHop[]

  @@index([clanId, status])
}
```

### RouteHop (añadidos)

```prisma
model RouteHop {
  id            Int             @id @default(autoincrement())
  routeId       String
  order         Int
  fromZoneId    Int
  toZoneId      Int
  portalSize    Int                              // 7 | 20 | 40 (tentáculo)
  expiresAt     DateTime
  status        RouteHopStatus  @default(ACTIVE)
  statusNote    String?                          // máx 100 chars
  statusSetById String?
  statusSetAt   DateTime?
  updatedAt     DateTime        @updatedAt

  route         Route           @relation(fields: [routeId], references: [id], onDelete: Cascade)
  fromZone      Zone            @relation("HopFrom", fields: [fromZoneId], references: [id])
  toZone        Zone            @relation("HopTo",   fields: [toZoneId],   references: [id])

  @@index([routeId])
  @@index([expiresAt, status])
}
```

### AuditLog (acciones actualizadas)

```prisma
// Schema sin cambios estructurales. Acciones válidas:
// CLAN_CREATE, CLAN_UPDATE, CLAN_DELETE
// MEMBER_ROLE_SYNCED, MEMBER_LEFT
// ROUTE_CREATE, ROUTE_UPDATE, ROUTE_DISABLE, ROUTE_DELETE
// HOP_STATUS_CHANGED, HOP_EXTENDED, HOP_DELETE
// SETTINGS_CHANGE, ROLE_MAPPING_CHANGE, WEBHOOK_UPDATE
// DISCORD_LOGIN_FIRST
```

### Eliminados completamente

- Tabla `InviteCode`.
- Enum `ClanRole` (OWNER/OFFICER/MEMBER).
- Acciones audit: `CODE_GENERATE`, `CODE_RESOLVE`, `MEMBER_JOIN`, `MEMBER_KICK` (reemplazadas por `MEMBER_ROLE_SYNCED`, `MEMBER_LEFT`).
- Endpoints `/api/external/*` (integración Loot Vigil).

---

## 6. Autenticación y sesión

### Flow de login

```
1. Usuario en '/' → "Login con Discord"
2. NextAuth redirige a OAuth Discord (scopes: identify email)
3. Callback /api/auth/callback/discord
4. signIn callback:
   - upsert User por discordId
   - refresh discordUsername, discordAvatar, globalNickname, email
   - isSuperAdmin = env.SUPER_ADMIN_DISCORD_IDS.includes(discordId)
5. jwt callback (solo en primer login o refresh):
   - fetch a Vigil Bot: GET /users/:discordId/clans
     → devuelve [{ clanId, discordRoleIds, appRole }] ya resuelto por el bot
   - para cada resultado: upsert ClanMember con appRole + lastSyncAt
6. session callback:
   - expone { id, discordId, username, avatar, globalNickname, isSuperAdmin }
7. Redirect a /dashboard
```

**Nota**: el bot resuelve `appRole` haciendo él la intersección `user_roles ∩ ClanRoleMapping`. Tracker no llama directamente a Discord API — todo pasa por el bot.

### Scopes OAuth Discord

- `identify` — user id, username, avatar, global_name.
- `email` — guardado en BD, nunca mostrado.

### Session shape

```ts
interface Session {
  user: {
    id: string;            // cuid interno
    discordId: string;
    username: string;
    globalNickname: string | null;
    email: string;         // interno, NUNCA en UI
    image: string | null;  // URL del avatar (cdn.discordapp.com)
    isSuperAdmin: boolean;
  };
  expires: string;
}
```

Strategy: JWT. Cookie `authjs.session-token`.

### Middleware

- Protege `/clan/*`, `/admin/*`, `/profile/*`.
- Si no hay sesión → redirect a `/`.
- Si `/admin/*` y no `isSuperAdmin` → redirect a `/dashboard`.
- No hace checks por clan (requiere BD, vive en Edge).

### Cache de roles

- `LRUCache<"(userId):(clanId)", CachedRole>` con TTL 30 min.
- Invalidación reactiva: webhook de Vigil Bot al recibir `GUILD_MEMBER_UPDATE` / `GUILD_ROLE_UPDATE`.
- Fallback en bot caído: leer de `ClanMember` en BD, marcar respuesta como `stale: true`, UI muestra banner, writes bloqueados (503).

### Super admin

- `isSuperAdmin` se hidrata desde env var en cada login.
- En código: helpers `requireRoleOrSuperAdminRead()` y `logAudit()` detectan el caso y aplican bypass / silence respectivamente.
- `/admin/*` endpoints requieren `isSuperAdmin === true`. Sin excepciones.

---

## 7. Contrato con Vigil Bot

Vigil Bot es **dependencia obligatoria**. Sin él, el clan no puede operar.

### Vigil Bot → expone (consumido por Tracker)

```
GET  /guilds/:guildId/health
  → 200 { installed: true, gatewayConnected: true }
  → 404 si bot no está en el guild

GET  /guilds/:guildId/roles
  → 200 [{ id, name, color, position }]
  Auth: Authorization: Bearer <VIGIL_BOT_SHARED_SECRET>

GET  /users/:discordId/clans
  → 200 [{ guildId, discordRoleIds: string[], computedAppRole: AppRole | null }]
  computedAppRole viene resuelto por el bot aplicando ClanRoleMapping
  (el bot necesita acceso read-only a la misma BD o una réplica de mappings)

GET  /guilds/:guildId/member/:discordId
  → 200 { nickname, avatar, joinedAt, roleIds, computedAppRole }

POST /guilds/:guildId/message
  body: { channelId, content, embed? }
  Auth: Bearer
```

### Vigil Bot → Tracker (webhooks)

```
POST /api/webhooks/vigil/role-change
  body: { guildId, discordId, newRoleIds, oldRoleIds }
  effect: invalida cache Tracker de (discordId, clan-de-guild), reconsulta bot

POST /api/webhooks/vigil/member-leave
  body: { guildId, discordId }
  effect: ClanMember.appRole = null

POST /api/webhooks/vigil/guild-update
  body: { guildId, newName?, newIcon? }
  effect: actualiza Clan.discordGuildName/Icon
```

Auth webhooks: `X-Vigil-Signature` = `HMAC-SHA256(VIGIL_BOT_SHARED_SECRET, body)`. Verificación con `timingSafeEqual`.

### Circuit breaker

```ts
const breaker = new CircuitBreaker({
  timeout: 2000,
  errorThreshold: 3,
  resetTimeout: 30_000,
});
```

Tras 3 fallos consecutivos → abierto 30s → reads OK con stale data, writes 503.

### Acople BD

Vigil Bot y Tracker comparten la misma Postgres en fase 1. El bot lee `ClanRoleMapping` directamente. Si en el futuro se separan, el bot tendrá su propia réplica o Tracker le enviará los mappings al cambiarlos.

---

## 8. UI — Vista primaria (grafo) y fallback (lista)

### Ruta principal: `/clan/:clanId`

Grafo interactivo con **`@xyflow/react`** (react-flow). Features:

- **Nodos custom** renderizados como React components:
  - Anchor zone: grande, dorado, al centro por defecto.
  - Zonas en rutas activas: mediano, color por tipo (Avalon violeta, Royal azul, Outlands rojo).
  - Zonas adyacentes (profundidad 1-2): pequeñas, grises, opcional.
  - Royal cities en rango: borde dorado.
  - Badges: tier (T4/T6/T8), `HO` si tiene hideout, `⌂` si es anchor.

- **Aristas custom**:
  - Grosor: 7p fina, 20p media, 40p (tentáculo) gruesa.
  - Color por tiempo restante: verde >60min, naranja 30-60, rojo <30, azul expirada.
  - Status visual: `COLLAPSED` → punteada con ❌, `WATCHED` → amarilla pulsante con 👁.
  - Tooltip al hover: zonas, portal size, minutos restantes, creador, última edición.

- **Layout**: force-directed con anchor fijo. Usuario puede arrastrar nodos, posiciones guardadas en `localStorage` key `avalon-layout-{clanId}`.
- **Zoom + pan**: integrado por react-flow. Minimap opcional esquina superior derecha.
- **Búsqueda + filtros**: barra superior (búsqueda por nombre, filtro por status, tamaño portal, tiempo restante, toggle zonas no-ruta, toggle pathfinding overlay).

### Panel lateral (al clickar nodo)

- Info de zona: tipo, tier, HO, dungeons.
- **Pathfinding**: "Royal más cerca: Fort Sterling (4 hops)" + "Rest más cerca: TNL-REST-123 (2 hops)". Click → pinta path en grafo principal.
- Rutas que pasan por esta zona.
- Botón "Crear ruta desde aquí" (si permisos).

### Toolbar inline en arista (al hover)

Para `CONTRIBUTOR+`:
- ✏️ Editar hop (modal completo)
- 🕐 Extender timer (`+30m` rápido)
- ⚠️ Cambiar estado (dropdown ACTIVE / COLLAPSED / WATCHED + nota opcional)
- 🗑️ Borrar hop (solo `EDITOR+`)

### Ruta fallback: `/clan/:clanId/list`

Tabla con filtros equivalentes. Cada fila expande hops con timers. Bulk edit disponible.

### Móvil

- **Portrait** (`matchMedia("(orientation: portrait)")` AND `window.innerWidth < 1024px`): redirect automático a `/clan/:clanId/list`.
- **Landscape** o tablet grande: permitir grafo con banner "Experiencia óptima en desktop (1280px+)".
- Detección: combinación `matchMedia("(orientation: landscape)")` + check de ancho.

### Entrada de datos (modal crear ruta)

- Autocomplete agresivo en zonas con badges `[T6] [AVALON] [HO]`.
- Shortcuts de tiempo `[+30m] [+1h] [+2h] [+4h] [+6h]`.
- Auto-continuidad entre hops.
- Validación de cadena con aviso permitiendo override.
- Submit con Enter.

---

## 9. Colaboración asíncrona

### Polling

- SWR hook `useClanData(clanId)` fetchea `/api/clans/:clanId/routes?since=<timestamp>` cada 10-15s si `document.visibilityState === "visible"`, cada 60s en background.
- Endpoint devuelve deltas: rutas con `updatedAt > since` + ids borradas.
- Cliente hace merge incremental con el estado local.

### Indicadores visuales

- Arista creada <30s atrás: pulse animado azul.
- Arista editada <60s atrás: borde brillante por 3s, luego normal.
- Tooltip: "Editada por [displayName] hace [relative time]".

### Conflictos

- Campo `Route.version` integer.
- `PATCH` envía header `If-Match: v=<n>`.
- Server verifica: si BD tiene v>n → 409 Conflict.
- Cliente: mostrar "Otro miembro cambió esto, recarga para ver los cambios".
- No hay OT/CRDT. Last-write-wins con aviso explícito.

### Real-time conservado

- Socket.io sigue vivo, único evento: `route-expired` cuando hops pasan de ACTIVE a EXPIRED automáticamente (check cada 30s en `server.ts`).
- Socket.io CORS: `origin: process.env.AUTH_URL, credentials: true`.
- Socket.io autenticación: validar JWT `authjs.session-token` en handshake y verificar membresía antes de `socket.join('clan:xxx')`.

---

## 10. Pathfinding

### World graph

- Fuente de data: `ao-bin-dumps` (dumps comunitarios de Albion, se actualizan cada patch).
- Script `scripts/import-world-graph.ts` parsea los dumps y puebla `ZoneConnection`.
- Mejora sobre el pathfinding existente — no rewrite desde cero, sino precómputo guardado en BD.

### Algoritmo

- BFS (todas las aristas peso 1).
- Ejecutado una vez en seed: `scripts/precompute-routing.ts`.
- Para cada zona con `type=AVALON`, calcula:
  - `nearestRoyalZoneId` + `hopsToRoyal` (prefiere capital > otras royal).
  - `nearestRestZoneId` + `hopsToRest` si existe en rango.
- Resultado en `ZoneRouting`.

### Exposición

```
GET /api/zones/:zoneId/routing
  → { nearestRoyal: { zone, hops }, nearestRest: { zone, hops } }
GET /api/zones/:zoneId/routing?withPath=1
  → incluye path completo (re-ejecuta BFS con parent-tracking, cacheable 10min in-memory)
```

### Visualización

- **On-demand**: click en nodo → panel lateral pinta path en overlay.
- **Global toggle**: "Mostrar salidas a royal" pinta líneas tenues desde cada zona Avalon activa hasta su royal más cercana.

### Actualización

Script re-ejecutable manualmente si `ao-bin-dumps` publica nueva versión. No automático.

---

## 11. Super admin

### `/admin` — dashboard

- Cards: # clanes, # rutas activas, # usuarios activos 24h, # hops expirando <30min.
- Timeline barras: rutas creadas/día últimos 30 días.
- Top zonas: count de hops últimos 7 días (solo para super admin).

### `/admin/map` — grafo global

- react-flow con rutas de todos los clanes superpuestas.
- Color por clan (hash determinista de `clanId`).
- Nodos con tráfico múltiple: anillo multicolor.
- Filtros: por clan, por zona, toggle hot-paths (top 10 caminos repetidos).

### `/admin/routes` — tabla cross-clan

- Columnas: clan, creador, cadena, portal sizes, creada, expira, status, última edición.
- Búsqueda full-text.
- **Export CSV**: `/api/admin/routes/export.csv`.

### `/admin/clans` — lista

- Stats por clan: # miembros, # rutas total, fecha creación, webhook configurado, Vigil Bot presente.
- Click → redirect a `/clan/:clanId` en modo observador (sin banner visible al resto, pero badge "👁 Observación" discreto en top bar solo para el super admin).

### Restricciones de endpoints

- Todos `/api/admin/*` con middleware `requireSuperAdmin()`.
- Solo GET. Mutaciones → 403.
- Sin audit trail (no escribir a AuditLog).
- Logs a stdout con prefijo `[super-admin]` para debug operacional.

### Acceso a audit logs ajenos

Los audit logs de un clan son visibles solo para Admins **de ese clan** vía `/api/clans/:clanId/audit`. El super admin **también** puede consultarlos vía ese mismo endpoint (bypass por `isSuperAdmin`), sin que se registre consulta — consistente con el modo observador fantasma. No hay un endpoint `/api/admin/audit` separado — se reutiliza el del clan.

---

## 12. Endpoints (lista canónica)

### Auth (NextAuth)

```
GET    /api/auth/signin
POST   /api/auth/signin/discord
GET    /api/auth/callback/discord
POST   /api/auth/signout
GET    /api/auth/session
```

### Me

```
GET    /api/me                            session + isSuperAdmin
GET    /api/me/clans                      clanes con appRole != null
POST   /api/me/refresh-roles              invalida cache, reconsulta Vigil Bot (rate limit 5/min)
PATCH  /api/me                            actualizar displayName
```

### Clanes

```
POST   /api/clans                         crea clan — VALIDA Vigil Bot en guild
GET    /api/clans/:clanId                 detalle (requires member o superadmin)
PATCH  /api/clans/:clanId                 nombre, webhook, anchorZone — ADMIN
DELETE /api/clans/:clanId                 borrar — ADMIN

GET    /api/clans/:clanId/members         lista
PATCH  /api/clans/:clanId/members/:id     displayName override — ADMIN

GET    /api/clans/:clanId/role-mappings   lista mapeos — ADMIN
POST   /api/clans/:clanId/role-mappings   upsert — ADMIN
DELETE /api/clans/:clanId/role-mappings/:id — ADMIN
GET    /api/clans/:clanId/discord-roles   proxy a Vigil Bot, lista real de roles del guild

GET    /api/clans/:clanId/routes          filtros + paginación
GET    /api/clans/:clanId/routes?since=   delta para polling SWR
POST   /api/clans/:clanId/routes          crear — CONTRIBUTOR+
GET    /api/clans/:clanId/routes/:id      detalle
PATCH  /api/clans/:clanId/routes/:id      editar (respeta If-Match version)
                                          DISABLE: CONTRIBUTOR+, DELETE: EDITOR+
DELETE /api/clans/:clanId/routes/:id      hard — EDITOR+

PATCH  /api/clans/:clanId/routes/:rid/hops/:hid   cambiar estado/timer — CONTRIBUTOR+
DELETE /api/clans/:clanId/routes/:rid/hops/:hid   borrar — EDITOR+

GET    /api/clans/:clanId/audit           log — ADMIN
POST   /api/clans/:clanId/webhook-test    test manual webhook — ADMIN
```

### Zonas

```
GET    /api/zones?q=<query>               autocomplete (limit 20, rate 60/min)
GET    /api/zones/:id                     detalle
GET    /api/zones/:id/routing             nearest royal + rest (cacheado 10min)
GET    /api/zones/:id/routing?withPath=1  con path
```

### Webhooks entrantes

```
POST   /api/webhooks/vigil/role-change    HMAC-verified
POST   /api/webhooks/vigil/member-leave   HMAC-verified
POST   /api/webhooks/vigil/guild-update   HMAC-verified
```

### Super admin

```
GET    /api/admin/overview
GET    /api/admin/routes?page=&filters=
GET    /api/admin/routes/export.csv
GET    /api/admin/clans
GET    /api/admin/users
GET    /api/admin/map
```

### Health

```
GET    /api/health
  → { db: bool, vigilBot: bool, socketIo: { connected: n }, uptime: s }
```

### Eliminados

- `/api/invite-codes/*`
- `/api/profile/code`
- `/api/external/route`
- `/api/external/zone-change`
- `POST /api/clans/:id/members` (aprobación de código)

---

## 13. Migración

### Estrategia: big-bang

La app no tiene usuarios reales. Se hace:

1. `prisma migrate reset --force` en prod (wipe completo).
2. Deploy nueva versión.
3. Arranque del contenedor ejecuta seeds:
   ```
   npx prisma migrate deploy
   npx tsx scripts/seed-zones.ts
   npx tsx scripts/import-world-graph.ts
   npx tsx scripts/precompute-routing.ts
   node server.js
   ```
4. Todos los seeds idempotentes (check si ya hay datos, skip).

### Dockerfile CMD actualizado

```dockerfile
CMD ["sh", "-c", "\
  npx prisma migrate deploy && \
  npx tsx scripts/seed-zones.ts && \
  npx tsx scripts/import-world-graph.ts && \
  npx tsx scripts/precompute-routing.ts && \
  node server.js"]
```

---

## 14. Manejo de errores

### Formato uniforme

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "mensaje humano es-ES",
    "field": "hops[0].toZone",
    "requestId": "req_abc123"
  }
}
```

Códigos:
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `INSUFFICIENT_ROLE` (403) con `required`, `have`
- `NOT_MEMBER` (403) con `clanId`
- `CONFLICT` (409) con `currentVersion`
- `STALE_DEPENDENCY` (503) cuando Vigil Bot caído
- `INTERNAL` (500) solo `requestId`, sin stack trace

### Cliente

Hook `useApiError()` que traduce `code` a mensaje ES + acción recomendada en toast.

### Cascadas de fallo

| Servicio caído | Comportamiento |
|---|---|
| Vigil Bot | Reads OK con stale=true, banner UI, writes → 503 |
| Discord API | Nuevos logins fallan, sesiones vigentes continúan |
| Postgres | 503 global, página maintenance estática |
| Socket.io | Expiración degrada a polling, silencioso |

---

## 15. Rate limiting

Token bucket in-memory con `lru-cache`. Sin Redis.

| Endpoint | Límite | Clave |
|---|---|---|
| `/api/auth/callback/discord` | 10/min | IP |
| `POST /api/clans/:id/routes` | 20/min | userId |
| `PATCH /api/clans/:id/routes/:rid` | 60/min | userId |
| `POST /api/me/refresh-roles` | 5/min | userId |
| `/api/webhooks/vigil/*` | 100/min | IP bot |
| `GET /api/zones` | 60/min | userId |
| Resto GET | sin límite | - |

Super admin: x10 del límite normal.

---

## 16. Seguridad

### Variables de entorno

```
AUTH_SECRET=<32 bytes random>
AUTH_URL=https://avalon.crintech.pro
DISCORD_CLIENT_ID=<from Dev Portal>
DISCORD_CLIENT_SECRET=<from Dev Portal>

VIGIL_BOT_API_URL=http://vigil-bot:4000
VIGIL_BOT_SHARED_SECRET=<32 bytes random>

SUPER_ADMIN_DISCORD_IDS=123456789012345678

DATABASE_URL=postgres://...
PRISMA_CLIENT_POOL_SIZE=5
```

Rotación de `VIGIL_BOT_SHARED_SECRET`: cada 3 meses, manual sincronizada.

### Webhook HMAC

```ts
const sig = req.headers['x-vigil-signature'];
const body = await req.text();
const expected = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
if (!timingSafeEqual(sig, expected)) return 401;
```

### Socket.io hardened

- CORS restringido a `AUTH_URL`.
- Handshake verifica JWT y membresía antes de `socket.join`.

### Headers de seguridad (next.config.ts)

```ts
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}
```

### Avatares Discord

`next.config.ts#images.remotePatterns` permite `cdn.discordapp.com`.

### CloudFlare Access (opcional, no en código)

Documentado en README como capa adicional para `/admin/*`. Free tier de CF Zero Trust. Activación manual si el super admin quiere defense-in-depth.

---

## 17. Observabilidad

Mínima y pragmática:

- **Logs**: `pino-http` JSON a stdout. Coolify/Docker los persiste.
- **Healthcheck**: `GET /api/health` cada 30s desde Coolify. Restart tras 3 fallos.
- **Métrica manual**: `/api/admin/overview` para tú mirar estado.
- **Sin Sentry / Prometheus** por ahora. El formato pino prepara el terreno si se añade.

---

## 18. Deploy

### Coolify

- Nuevas env vars listadas en Seguridad.
- Healthcheck configurado con `/api/health`.
- Sin volumes nuevos.
- Vigil Bot como servicio adjacent en la misma red Coolify (`vigil-bot:4000` resuelto internamente).

### Pgbouncer

No obligatorio ahora. Entra cuando aparezca el tercer proyecto escribiendo a la misma Postgres. Vendría como servicio adicional en Coolify.

---

## 19. Escalabilidad (Hetzner 4vCPU / 8GB / 80GB)

Análisis con budget efectivo ~1.5GB RAM y ~1 vCPU para Avalon Tracker:

| Recurso | Techo práctico | Breaking factor |
|---|---|---|
| Next.js RSS | ~1 GB | Memory leak / SSR pesado |
| Socket.io concurrentes | ~5.000 | in-memory adapter |
| Postgres connections | ~80 compartidos | multi-app sin pgbouncer |
| API throughput | ~500-1000 req/s | 1 vCPU |
| Bandwidth | 20 TB/mes Hetzner | irrelevante |

Concurrencia esperada realista (10 clanes, 30-100 miembros, ~10-30% online simultáneo en pico): 50-200 concurrentes. **10x de margen**.

Cuello de botella real: Postgres connection pool si otros proyectos escalan. Mitigación: `PRISMA_CLIENT_POOL_SIZE=5`, pgbouncer proactivo cuando llegue el tercer proyecto.

---

## 20. Fuera de scope (explícito)

- Discord slash commands (entrarán en spec del Vigil Bot).
- Enlaces públicos de rutas.
- Copy-as-text de rutas.
- Federación cross-clan (alianzas).
- Heatmaps públicos para jugadores no logueados.
- Monetización in-app / billing / tiers de pago (se canaliza por Vigil Bot).
- Sentry / Prometheus / Grafana.
- Tests automatizados completos (se harán en fases posteriores, no bloqueantes para lanzar).
- SSE para real-time (polling es suficiente).
- Google OAuth (reemplazado por Discord).

---

## 21. Preguntas abiertas

Ninguna al momento de escribir este spec. Si surgen en implementación, se anotarán aquí como updates.

---

## 22. Referencias

- [Tripwire Map](https://tripwiremap.app/)
- [Tripwire Guide — Brave Collective](https://wiki.bravecollective.com/public/corps/spoopy-newbies/tripwire-guide)
- [Pathfinder — EVE LinkNet](https://wiki.eve-linknet.com/en/tools/pathfinder)
- [All-Out Pathfinder Guide](https://all-out.github.io/guides/pathfinder/)
- `ao-data/ao-bin-dumps` — dumps comunitarios del cliente Albion Online (verificar URL exacta en implementación)
- Discord Developer Portal — OAuth2 scopes
- NextAuth v5 — [Discord Provider](https://authjs.dev/getting-started/providers/discord)
- `@xyflow/react` — [docs](https://reactflow.dev/)
