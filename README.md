# Avalon Tracker

Herramienta colaborativa para mapear los Caminos de Avalon (Roads of Avalon) de Albion Online entre miembros de un clan. Vista primaria en **grafo interactivo** tipo Tripwire/Pathfinder con timers en vivo, pathfinding a salidas a Royal Cities / Rests y notificaciones a Discord.

> **Estado**: rediseño Discord-native completado en la rama `feat/discord-redesign-backend` (78 commits). Pendiente de merge a `main` y primer deploy con el stack nuevo.

---

## Funcionalidades

### Autenticación Discord-native
- Login con **Discord OAuth** (scopes mínimos: `identify email`). Sin contraseñas, sin Google.
- **Vigil Bot obligatorio**: autoridad de roles del guild + notificaciones. Avalon Tracker no habla directamente con la API de Discord — todo va vía el bot.
- Identidad proyectada en la app: Discord username / global nickname / avatar. Email jamás se renderiza.
- Sesiones JWT (NextAuth v5).

### Roles (4, jerárquicos)
| Nivel | Enum | UI ES | Puede |
|:-:|---|---|---|
| 4 | `ADMIN` | Admin | Todo (gestionar clan, roles, webhook, borrar) |
| 3 | `EDITOR` | Editor | Crear + editar + borrar rutas |
| 2 | `CONTRIBUTOR` | Colaborador | Crear + editar (sin borrar) |
| 1 | `VIEWER` | Observador | Solo lectura |

Mapeo **many-to-many** desde roles Discord. Un usuario con varios roles mapeados → gana el más alto. Configurable por Admin desde Settings del clan (dropdown con roles reales del guild).

### Grafo interactivo (vista primaria)
- `@xyflow/react` con nodos custom (zonas con badges T4/T6/T8/HO/Rest/Capital) y edges custom (grosor por tamaño de portal 7/20/40, color por tiempo restante, status visual COLLAPSED/WATCHED).
- **Anchor zone** configurable por clan (típicamente HO Avalon): centro del grafo, layout radial.
- Panel lateral al clickar nodo: datos de la zona + **pathfinding** (royal más cercana + rest más cercano, hops).
- Toolbar inline al hover sobre edge: extend timer, cambiar status, borrar (según permisos).
- Drag/zoom/pan, minimap. Posiciones persistidas en `localStorage` por clan.

### Lista fallback
- `/clan/[id]/list` para móvil portrait (redirect automático si `orientation: portrait && width < 1024px`), ediciones masivas o preferencia del usuario.
- Tabla con filtros, disable/delete con `If-Match: v=N` header (optimistic concurrency).

### Pathfinding
- `ao-bin-dumps` como fuente del world-graph.
- BFS precomputado (`ZoneRouting` tabla) al arranque: para cada zona Avalon, la royal más cercana y el rest más cercano con su número de hops.
- Expuesto vía `GET /api/zones/:id/routing`.

### Colaboración asíncrona
- SWR con **polling dinámico**: 10-15s cuando la pestaña está visible, 60s en background.
- Endpoint delta: `GET /api/clans/:id/routes?since=<iso>` devuelve solo rutas con `updatedAt > since`.
- **Optimistic concurrency**: `Route.version` + header `If-Match: v=N`. Conflictos devuelven 409 con mensaje "Otro miembro editó esto, recarga".
- Socket.io conservado únicamente para el evento `route-expired` (timer server-side cada 30s).

### Discord webhook por clan
- URL configurable por Admin en Settings.
- Botón "Probar" envía mensaje test al canal.
- Notificaciones automáticas en expiración (vía Vigil Bot cuando esté implementado en el bot).

### Super Admin ("observador fantasma")
- Definido por env `SUPER_ADMIN_DISCORD_IDS="id1,id2"`.
- En clanes ajenos: solo GET, sin audit trail.
- En clanes propios: permisos de su rol Discord normal.
- UI dedicada en `/admin/*`: dashboard, grafo global cross-clan, tabla de rutas, CSV export, listado de clanes y users.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind v4 |
| Grafo | `@xyflow/react` 12.x con custom nodes/edges |
| Data fetching | SWR 2.x (con polling visible/background) |
| Toasts | `react-hot-toast` |
| Auth | NextAuth v5 beta + Discord provider |
| BD | PostgreSQL 16 + Prisma v7 (PrismaPg adapter) |
| Realtime | Socket.io 4.x (JWT handshake + CORS restringido) |
| Logs | `pino` + `pino-http` (JSON a stdout) |
| Rate limit | `lru-cache` token bucket in-memory |
| Discord | OAuth + Vigil Bot (HTTP + HMAC webhooks) |
| Deploy | Docker multi-stage + Coolify |

### Dependencias obligatorias

1. **Discord Application** — para OAuth (Client ID/Secret).
2. **Vigil Bot** — sibling service corriendo en el mismo Coolify network, resuelve roles y emite webhooks. Sin bot → la app no puede autorizar.
3. **PostgreSQL** — Prisma v7 con adapter `@prisma/adapter-pg`.

---

## Arquitectura

```
┌──────────────────────────────────────────────┐
│  Browser (React 19)                          │
│  - react-flow graph (primary view)           │
│  - SWR polling 10-15s visible, 60s bg        │
│  - Socket.io client (solo route-expired)     │
└──────────┬───────────────────────────────────┘
           │ HTTPS (cookie authjs JWT)
┌──────────▼───────────────────────────────────┐
│  Next.js 16 server (Coolify / VPS)           │
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

---

## Estructura del proyecto

```
avalon-tracker/
├── prisma/
│   └── schema.prisma              # User, Clan, ClanMember, ClanRoleMapping,
│                                  # Route (version), RouteHop (COLLAPSED/WATCHED),
│                                  # Zone (tier/HO/rest/capital), ZoneConnection,
│                                  # ZoneRouting (pathfinding precalc), AuditLog
├── scripts/
│   ├── seed-zones.ts              # Zonas desde JSON (idempotente)
│   ├── import-world-graph.ts      # Poblado de ZoneConnection desde dump
│   ├── precompute-routing.ts      # BFS → ZoneRouting (nearest royal/rest)
│   └── mock-vigil-bot.ts          # Mock Express del bot para dev local
├── src/
│   ├── app/
│   │   ├── page.tsx               # Landing Discord login
│   │   ├── loading.tsx, error.tsx, not-found.tsx
│   │   ├── (auth)/
│   │   │   ├── dashboard/         # Mis clanes con rol badge
│   │   │   ├── profile/           # Discord identity + displayName override
│   │   │   ├── clan/[clanId]/
│   │   │   │   ├── page.tsx       # GRAFO primario (react-flow)
│   │   │   │   ├── list/          # Vista lista fallback
│   │   │   │   ├── settings/      # Webhook + anchor + role mappings
│   │   │   │   ├── members/       # Lista Discord + displayName override admin
│   │   │   │   └── audit/         # Log de acciones (Admin only)
│   │   │   └── admin/             # Super admin: dashboard, map, routes, clans, users
│   │   └── api/                   # Ver sección "API Endpoints"
│   ├── components/
│   │   ├── auth/                  # LandingLoginDiscord
│   │   ├── layout/                # Sidebar (Discord avatar + super admin badge)
│   │   ├── clan/                  # CreateClanModal (guild ID), RoleMappingEditor, ClanTabs
│   │   ├── zones/                 # ZoneAutocomplete v2, ZoneBadges
│   │   ├── routes/                # CreateRouteModal v2, RouteListTable, RouteTimer
│   │   ├── graph/                 # ClanGraph, ZoneNode, RouteEdge,
│   │   │                          # ZoneSidePanel, HopInlineToolbar,
│   │   │                          # graph-layout.ts, graph-colors.ts
│   │   ├── admin/                 # AdminCard, GlobalGraphClient
│   │   └── providers/             # SWRProvider, ToastProvider
│   ├── hooks/
│   │   ├── useMe.ts, useMyClans.ts, useClan.ts
│   │   ├── useClanRoutes.ts       # SWR con polling delta
│   │   ├── useVisibilityPolling.ts
│   │   ├── useZoneSearch.ts       # autocomplete debounced
│   │   └── useZoneRouting.ts      # pathfinding on-demand
│   ├── lib/
│   │   ├── auth.ts, auth.config.ts  # NextAuth Discord + Edge-safe
│   │   ├── prisma.ts              # Cliente Prisma singleton
│   │   ├── permissions.ts         # resolveAppRole + cache LRU 30min + super admin helpers
│   │   ├── vigil-bot-client.ts    # HTTP client con circuit breaker + timeout 2s
│   │   ├── audit.ts               # logAudit con bypass silencioso super admin
│   │   ├── hmac.ts                # sign/verify para webhooks
│   │   ├── rate-limit.ts          # token bucket in-memory
│   │   ├── version-check.ts       # If-Match parsing para optimistic concurrency
│   │   ├── fetcher.ts             # SWR fetcher con ApiError
│   │   ├── logger.ts              # pino
│   │   ├── api-error.ts           # Error envelope uniforme
│   │   ├── time.ts                # colorForMinutes, formatCountdown
│   │   └── role-ui.ts             # roleLabel, canCreate/canDelete/canAdmin
│   ├── data/                      # avalon-zones.json, world-zones.json, world-graph.json
│   └── types/next-auth.d.ts       # Session shape con discordId + isSuperAdmin
├── tests/                         # Vitest (42 tests, libs puras)
├── docs/superpowers/
│   ├── specs/2026-04-20-discord-redesign-design.md
│   └── plans/
│       ├── 2026-04-21-backend-redesign.md   (+ execution summary)
│       └── 2026-04-21-frontend-rewrite.md   (+ execution summary)
├── server.ts                      # Next.js + Socket.io (JWT handshake) + timer expiración
├── Dockerfile                     # Multi-stage; CMD: db push + seeds + precompute + server
├── docker-compose.yml
├── nginx.conf                     # Reverse proxy + WebSocket
└── vitest.config.ts
```

---

## API Endpoints

### Sesión (`/api/auth/*`)
Gestionados por NextAuth con provider Discord.

### Usuario actual (`/api/me/*`)
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/me` | Autenticado |
| PATCH | `/api/me` | Autenticado (displayName override) |
| GET | `/api/me/clans` | Autenticado |
| POST | `/api/me/refresh-roles` | Autenticado (rate 5/min) |

### Clanes y miembros
| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/clans` | Autenticado (valida Vigil Bot en guild) |
| GET | `/api/clans/:clanId` | Miembro |
| PATCH | `/api/clans/:clanId` | Admin |
| DELETE | `/api/clans/:clanId` | Admin |
| GET | `/api/clans/:clanId/members` | Miembro |
| PATCH | `/api/clans/:clanId/members/:id` | Admin (displayName override) |
| GET | `/api/clans/:clanId/role-mappings` | Admin |
| POST | `/api/clans/:clanId/role-mappings` | Admin |
| DELETE | `/api/clans/:clanId/role-mappings/:id` | Admin |
| GET | `/api/clans/:clanId/discord-roles` | Admin (proxy a Vigil Bot) |
| GET | `/api/clans/:clanId/audit` | Admin |
| POST | `/api/clans/:clanId/webhook-test` | Admin |

### Rutas y hops
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/clans/:clanId/routes?status=&since=` | Miembro |
| POST | `/api/clans/:clanId/routes` | Contributor+ (rate 20/min) |
| GET | `/api/clans/:clanId/routes/:id` | Miembro |
| PATCH | `/api/clans/:clanId/routes/:id` | Contributor+ (If-Match, rate 60/min) |
| DELETE | `/api/clans/:clanId/routes/:id` | Editor+ |
| PATCH | `/api/clans/:clanId/routes/:rid/hops/:hid` | Contributor+ |
| DELETE | `/api/clans/:clanId/routes/:rid/hops/:hid` | Editor+ |

### Zonas y pathfinding
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/zones?q=` | Autenticado (rate 60/min) |
| GET | `/api/zones/:id` | Autenticado |
| GET | `/api/zones/:id/routing` | Autenticado |

### Webhooks entrantes (Vigil Bot → Tracker)
Todos con `X-Vigil-Signature: HMAC-SHA256(body, VIGIL_BOT_SHARED_SECRET)` y rate limit 100/min por IP.

| Método | Ruta |
|---|---|
| POST | `/api/webhooks/vigil/role-change` |
| POST | `/api/webhooks/vigil/member-leave` |
| POST | `/api/webhooks/vigil/guild-update` |

### Endpoint interno (Tracker → Vigil Bot coordination)
| Método | Ruta | Auth |
|---|---|---|
| GET | `/api/internal/role-mappings/:guildId` | Bearer `VIGIL_BOT_SHARED_SECRET` |

### Super admin (`isSuperAdmin=true` only, sin audit)
| Método | Ruta |
|---|---|
| GET | `/api/admin/overview` |
| GET | `/api/admin/routes?status=&zone=&clanId=` |
| GET | `/api/admin/routes/export.csv` |
| GET | `/api/admin/clans` |
| GET | `/api/admin/users?q=` |
| GET | `/api/admin/map?clanId=` |

### Health
`GET /api/health` → `{ db, vigilBot, uptime }`. 503 si DB caída.

---

## Modelo de datos (resumido)

| Entidad | Campos clave |
|---|---|
| **User** | `discordId` (unique), `discordUsername`, `email` (no renderizar), `displayName?`, `isSuperAdmin` |
| **Clan** | `name` (unique), `discordGuildId` (unique), `anchorZoneId?`, `discordWebhookUrl?`, `botInstalled`, `tier?` |
| **ClanRoleMapping** | `clanId`, `discordRoleId`, `appRole` (many-to-many) |
| **ClanMember** | `userId`, `clanId`, `appRole?` (nullable = sin acceso), `lastSyncAt` |
| **Zone** | `name` (unique), `type` (AVALON/ROYAL/OUTLANDS), `tier?`, `hasHideout`, `isRest`, `isCapital` |
| **ZoneConnection** | `fromZoneId`, `toZoneId`, `connectionType` |
| **ZoneRouting** | `zoneId` (PK), `nearestRoyalZoneId?`, `hopsToRoyal?`, `nearestRestZoneId?`, `hopsToRest?` |
| **Route** | `clanId`, `createdById`, `status`, `version` (optimistic concurrency), `notes?` |
| **RouteHop** | `routeId`, `order`, `fromZoneId`, `toZoneId`, `portalSize`, `expiresAt`, `status` (ACTIVE/EXPIRED/COLLAPSED/WATCHED), `statusNote?` |
| **AuditLog** | `clanId`, `userId`, `action`, `targetId?`, `details?` |

Ver `prisma/schema.prisma` para los detalles completos. `AppRole` y `RouteHopStatus` son nuevos enums.

---

## Desarrollo local

No hace falta Docker local gracias al mock del bot:

```bash
npm install

# Copiar .env.example → .env y rellenar (sin Docker local, DATABASE_URL puede
# apuntar a un Postgres remoto o de staging)
cp .env.example .env

# Mock de Vigil Bot en localhost:4000 (fake guild + users)
npm run mock-bot

# En otra terminal
npx prisma generate   # regenera cliente local, no toca BD
npm run dev           # Next.js en localhost:3000
```

El mock expone los 5 endpoints que el Tracker espera del bot con Bearer auth y un guild fake (`111111111111111111`) + 3 usuarios fake con roles mapeados. Suficiente para probar UI sin Discord real.

### Tests

```bash
npm test              # Vitest: 42 tests (libs puras: permissions, hmac,
                      # rate-limit, version-check, vigil-bot-client,
                      # precompute-routing, time, role-ui)
npm run test:watch
```

### Scripts útiles

| Comando | Acción |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Build producción (requiere Node ≥20) |
| `npm run start:prod` | Arranca `server.js` (Socket.io + Next.js) |
| `npm run mock-bot` | Mock Vigil Bot en :4000 |
| `npm run seed:zones` | Seed Zone desde JSON (idempotente) |
| `npm run seed:graph` | Importa ZoneConnection desde `world-graph.json` |
| `npm run precompute` | BFS → ZoneRouting (nearest royal/rest) |

---

## Deploy en Coolify

### Prerequisitos

1. **Discord Application** en [discord.com/developers/applications](https://discord.com/developers/applications):
   - `New Application` → nombrarla (p.ej. Avalon Tracker)
   - Pestaña **OAuth2 → General**: copiar Client ID + Client Secret
   - **Redirects**: añadir `https://tu-dominio.com/api/auth/callback/discord`

2. **Vigil Bot** desplegado en el **mismo Coolify network** que Avalon Tracker. Mismo `VIGIL_BOT_SHARED_SECRET` en las env vars de ambas apps. Ver repo `vigil-bot`.

3. **PostgreSQL** en Coolify (genera la `DATABASE_URL`).

4. **Shared secret** para bot↔tracker:
   ```bash
   openssl rand -hex 32
   ```

5. **Tu Discord ID** (Ajustes → Avanzado → Developer Mode, click derecho sobre tu user → Copiar ID) para `SUPER_ADMIN_DISCORD_IDS`.

### Env vars en Coolify

```
# Auth
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=https://tu-dominio.com
NEXT_PUBLIC_APP_URL=https://tu-dominio.com

# Discord OAuth
DISCORD_CLIENT_ID=<del Discord Developer Portal>
DISCORD_CLIENT_SECRET=<idem>

# Vigil Bot
VIGIL_BOT_API_URL=http://vigil-bot:<puerto>   # resolve interno de Coolify
VIGIL_BOT_SHARED_SECRET=<mismo en ambas apps>

# Super admin (opcional)
SUPER_ADMIN_DISCORD_IDS=123456789012345678

# BD
DATABASE_URL=<la que te da Coolify>
PRISMA_CLIENT_POOL_SIZE=5
```

**Env vars obsoletas que HAY QUE ELIMINAR** si venías del stack viejo:
- `AUTH_SIMPLE_PASSWORD`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `SUPER_ADMIN_EMAIL`
- `EXTERNAL_API_KEY` (Loot Vigil fue eliminado)

### Primer deploy

El Dockerfile CMD ejecuta:
```bash
npx prisma db push --accept-data-loss    # big-bang, resetea schema
npx tsx scripts/seed-zones.ts            # idempotente
npx tsx scripts/import-world-graph.ts    # idempotente (skip si vacío)
npx tsx scripts/precompute-routing.ts    # idempotente (skip si sin conexiones)
node server.js                           # arranca Next + Socket.io
```

**⚠️ El primer deploy resetea la BD completamente** (por el `db push --accept-data-loss`). Solo es aceptable porque la app está en boceto sin usuarios reales. Cuando el schema se estabilice, migrar a `prisma migrate deploy` con historial versionado.

Healthcheck: `GET /api/health` cada 30s. Si falla 3 veces seguidas, Coolify reinicia.

### Hardening opcional: CloudFlare Access para `/admin/*`

Si quieres una capa extra para el panel super admin (defense-in-depth):

1. En Cloudflare Zero Trust → **Access Applications** → New Application
2. Apunta a `tu-dominio.com/admin/*`
3. Policy: email allowlist con `tu@email.com`
4. La app no requiere cambios — CF Access intercepta antes de llegar a Next.js

---

## Seguridad

- **Discord OAuth** con scopes mínimos (`identify email`). Sin `guilds.members.read` — todo va vía bot.
- **JWT cookie** `authjs.session-token` HttpOnly + Secure.
- **Socket.io** handshake valida el JWT + verifica membresía antes de `socket.join`. CORS restringido a `AUTH_URL`.
- **Webhooks entrantes** verifican HMAC-SHA256 con `timingSafeEqual`. Rate limit 100/min por IP.
- **Endpoint interno** (`/api/internal/*`) con Bearer token.
- **Rate limits** en endpoints críticos (callback OAuth, POST rutas, PATCH rutas, zones, refresh-roles).
- **Headers de seguridad** (next.config.ts): X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy.
- **Super admin silencioso**: sin entradas en audit log cuando opera en clanes ajenos (aceptado conscientemente — riesgo asumido por operador).

---

## Escalabilidad

VPS Hetzner 4vCPU / 8GB compartido con otros proyectos. Techos prácticos calculados con budget efectivo ~1.5 GB RAM / 1 vCPU:

| Recurso | Techo | Revienta primero si… |
|---|---|---|
| Next.js RSS | ~1 GB | memory leak o SSR pesado |
| Socket.io concurrentes | ~5.000 | adapter in-memory |
| Postgres connections | ~80 compartidos | multi-app sin pgbouncer |
| API req/s | ~500-1000 | 1 vCPU |
| Bandwidth | 20 TB/mes Hetzner | irrelevante |

Concurrencia esperada realista (10 clanes × 30-100 miembros con 10-30% online pico) = 50-200 concurrentes. **10× de margen**.

Cuello real: pool de conexiones Postgres si escalan los sibling projects. Mitigado con `PRISMA_CLIENT_POOL_SIZE=5`. pgbouncer proactivo cuando aparezca el tercer proyecto escribiendo al mismo Postgres.

---

## Contrato con Vigil Bot (resumen)

El bot expone (consumido por Tracker, Bearer auth):
- `GET /guilds/:id/health`
- `GET /guilds/:id/roles`
- `GET /guilds/:id/member/:discordId/roles` → `{ discordRoleIds, computedAppRole }`
- `GET /guilds/:id/member/:discordId` → `{ nickname, avatar (hash), joinedAt (ISO), discordRoleIds, computedAppRole }`
- `GET /users/:discordId/clans` → `[{ guildId, discordRoleIds, computedAppRole }]`
- `POST /guilds/:id/message` → envío a canal

El bot llama (HMAC-SHA256 del body):
- `POST /api/webhooks/vigil/role-change`
- `POST /api/webhooks/vigil/member-leave`
- `POST /api/webhooks/vigil/guild-update`

El Tracker expone para el bot (Bearer):
- `GET /api/internal/role-mappings/:guildId` — el bot lo cachea 60s y computa appRole localmente (no BD compartida).

Detalle completo en `docs/superpowers/specs/2026-04-20-discord-redesign-design.md` §7.

---

## Fuentes de datos

- Zonas avalonianas (tier, recursos, cofres, dungeons): [AO-Noki/avalon-roads](https://github.com/AO-Noki/avalon-roads)
- Zonas del mundo + topología: [ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) — se actualiza en cada patch mayor de Albion
- Información de portales: [Wiki — Roads of Avalon](https://wiki.albiononline.com/wiki/Roads_of_Avalon)
- Referencias UX: [Tripwire](https://tripwiremap.app/) y [Pathfinder](https://wiki.eve-linknet.com/en/tools/pathfinder) (EVE Online)

---

## Follow-ups conocidos

- `world-graph.json` actual está keyed por zone id (~115 KB, shape distinta a lo que espera `import-world-graph.ts`). Hay que escribir un transformer para que el pathfinding inserte conexiones reales. Mientras tanto, `precompute-routing.ts` skipea limpiamente y `ZoneRouting` queda vacío.
- 2 TS errors triviales en `tests/lib/rate-limit.test.ts` (narrowing de discriminated union). Runtime OK.
- Migrar Dockerfile CMD de `prisma db push --accept-data-loss` a `prisma migrate deploy` cuando el schema se estabilice (requiere generar historial versionado contra BD staging).
- Slash commands de Vigil Bot para crear/editar rutas desde Discord — fuera del scope actual, pendiente de un Plan 4.

---

## Licencia

Proyecto privado.
