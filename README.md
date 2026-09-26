> 🌐 **English README:** [README.en.md](README.en.md) — same content in English.

# Avalon Tracker

Herramienta colaborativa para mapear los **Caminos de Avalon** (Roads of Avalon) de Albion Online entre miembros de un clan. Vista primaria en **grafo interactivo** con timers en vivo, pathfinding a salidas a Royal Cities / Rests y notificaciones a Discord.

> **Open source · MIT** — el código es libre. El despliegue público en [avalontracker.app](https://avalontracker.app) lo mantengo yo (Crintech Studios), pero **te animo a montar tu propio portal privado** para tu clan: así la información sensible (rutas, anchors, partes de seguridad) **se queda bajo tu llave**, sin que terceros — ni yo — vean nada.

---

## ¿Por qué montar mi propio portal?

- **Privacidad total** — tus rutas, anchors, partes de seguridad y tickets viven en tu Postgres, no en los míos.
- **Sin dependencia de mi VPS** — si dejo de pagar el hosting o cambio el dominio, tu clan sigue funcionando.
- **Personalización** — branding, idiomas extra, integraciones propias con tu Discord. El código es tuyo.
- **Confianza por código** — nada que esté en este repo es secreto. Audita lo que despliegues.
- **Coste mínimo** — un VPS pequeño + Postgres compartido es suficiente para un clan de hasta 200 personas.

---

## Funcionalidades principales

### Parte pública (sin cuenta)
- **`/zones`**: las 400 zonas de los Caminos de Avalon con buscador y filtros (tier, recurso, cofre, mazmorra, clase, hideout). **`/zones/<zona>`**: ficha indexable con minimapa, recursos con el tier de cada nodo, cofres por calidad y tamaño, mazmorras y zonas parecidas. En inglés y en `/es/...`.
- **`/exits`**: «¿dónde he salido?» → ciudad royal y portales royal más cercanos desde cualquier zona del mundo.
- Datos sacados de los ficheros del juego: ver [`src/data/README.md`](src/data/README.md).

### Mapas personales (sin Discord)
- **`/map`** crea un mapa personal en un clic, sin cuenta: se abre una **cuenta de invitado** vinculada al navegador.
- Al entrar con Discord, los mapas del invitado **pasan a la cuenta real** (cookie firmada de 10 min + fusión en el callback de Discord).
- Un mapa personal se puede **convertir en mapa de clan** (mismos requisitos que crear un clan: Vigil Bot + owner/admin del servidor). Mismo id, mismas rutas.
- Invitados sin actividad durante 30 días se borran con sus mapas. Máximo 3 mapas personales por persona.

### Autenticación Discord-native
- Login con **Discord OAuth** (scopes mínimos: `identify email`). Sin contraseñas, sin Google.
- **Vigil Bot** (servicio sibling) actúa como autoridad de roles y emisor de notificaciones. Avalon Tracker no habla directamente con la Discord API — todo va vía el bot.
- Sesiones JWT (NextAuth v5), cookie persistente 14 días.

### Roles del clan (4 niveles, jerárquicos)
| Nivel | Enum | UI ES | Puede |
|:-:|---|---|---|
| 4 | `ADMIN` | Admin | Todo (gestionar clan, roles, webhook, borrar) |
| 3 | `EDITOR` | Editor | Crear + editar + borrar rutas |
| 2 | `CONTRIBUTOR` | Colaborador | Crear + editar (sin borrar) |
| 1 | `VIEWER` | Observador | Solo lectura |

Mapeo **many-to-many** desde roles de Discord. El usuario con varios roles mapeados gana el más alto. Configurable por Admin desde Settings del clan.

**El creador del clan siempre es ADMIN** (no se puede degradar ni aunque sus roles Discord cambien).

### Grafo interactivo
- `@xyflow/react` con nodos custom (zonas con badges T-tier, HO, Rest, Capital y borde por tipo PvP) y edges custom (grosor por tamaño de portal, color por tiempo restante).
- **Anchor zone** del clan configurable — punto fijo desde el que parten las rutas.
- **Parte de seguridad** del anchor (semáforo verde/amarillo/rojo) editable por cualquier CONTRIBUTOR+.
- Layout multi-árbol top-down con dagre, edges rectos, ángulos a 45° en bifurcaciones.
- Drag-and-drop de nodos persistido en `localStorage` por clan.
- Click en timer → editar tiempo a mano. Click en zona → panel lateral con pathfinding + acciones.

### Lista alternativa
- `/clan/[id]/list`: tabla con filtros, fusión de rutas, push a Discord, copia como imagen.
- Cada ruta puede tener **bifurcaciones internas** que la lista descompone en filas independientes.
- Borrado **soft con TTL de 2 días** (recuperable desde la **Papelera**).

### Pathfinding con dump del juego
- World-graph extraído de [`broderickhyman/ao-bin-dumps`](https://github.com/broderickhyman/ao-bin-dumps) procesado con un script de extracción local.
- BFS en runtime para encontrar **2 portales más cercanos** desde una zona negra y la **royal city más cercana** desde cualquier no-royal-city.
- Datos en `src/data/world-meta.json` — refrescables tras parches del juego.

### Compartir con Discord
- Webhook por clan configurable.
- Push de ruta como **embed + imagen PNG** generada client-side (html-to-image) con branding "Avalon Tracker by Crintech Studios" (puedes cambiarlo si forkeas).
- Cada ruta se puede **copiar como imagen al portapapeles** sin tocar Discord.
- Hora de cierre en **Albion Time (UTC+0)** + huso local del que comparte, con auto-detección de DST.

### Otros
- 25 idiomas (inglés y castellano nativos, resto en beta).
- Audit log por clan accesible solo a ADMIN del propio clan.
- Sistema de feedback/tickets vía Vigil Bot.

---

## Modelo de permisos

**RBAC estricto per-clan.** Cada clan es una unidad de privacidad estanca: el rol ADMIN está scoped al clan donde se otorga, no al sistema. Para ver el contenido de un clan tienes que ser miembro de ese clan con el rol que su ADMIN te haya asignado.

Esto significa que **ni el operador del servidor** (tú, si self-hosteas) tiene visibilidad cross-clan vía aplicación. Para acceso a datos crudos puedes ir a Postgres directamente — pero no hay UI ni API que lo facilite.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind v4 |
| Grafo | `@xyflow/react` + dagre layout |
| Data fetching | SWR 2.x con polling visible/background |
| Auth | NextAuth v5 + Discord provider |
| BD | PostgreSQL 16 + Prisma v7 (PrismaPg adapter) |
| Discord | OAuth + Vigil Bot (HTTP + HMAC webhooks) |
| Deploy | Docker multi-stage |

---

## Self-host: panel privado para tu clan

Esta sección asume Linux + Docker. Adapta a tu infra (Coolify, Fly, Railway, k8s, lo que sea).

### Paso 1 — Discord Application

1. Ve a [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. Pestaña **OAuth2 → General**: copia **Client ID** y **Client Secret**.
3. Añade redirect URI: `https://TU-DOMINIO/api/auth/callback/discord` (o `http://localhost:3000/...` para dev).

### Paso 2 — Vigil Bot

Avalon Tracker requiere un **Vigil Bot** corriendo. Es un sibling que:
- Resuelve roles del guild Discord (autoridad).
- Emite webhooks cuando alguien se va o cambia rol.
- Encola tickets de feedback en un canal Discord del clan.

```bash
git clone https://github.com/Crinlorite/vigil-discordbot.git
cd vigil-discordbot
# Sigue las instrucciones de su README para añadirlo a tu guild Discord
# y desplegarlo. Apunta a su URL desde VIGIL_BOT_API_URL.
```

### Paso 3 — Variables de entorno

```bash
git clone https://github.com/Crinlorite/avalon-tracker.git
cd avalon-tracker
cp .env.example .env
```

Edita `.env`. Las **(*) marcadas son obligatorias**:

| Variable | Cómo conseguirla |
|---|---|
| (*) `AUTH_SECRET` | `openssl rand -base64 32` |
| (*) `AUTH_URL` | URL pública del sitio (ej: `https://avalon.miclan.es`) |
| `NEXT_PUBLIC_APP_URL` | Igual que `AUTH_URL`, expuesta al cliente |
| (*) `DISCORD_CLIENT_ID` / `_SECRET` | Del Discord Developer Portal (Paso 1) |
| (*) `VIGIL_BOT_API_URL` | URL del bot accesible desde el server |
| (*) `VIGIL_BOT_SHARED_SECRET` | `openssl rand -hex 32` (mismo valor en bot y app) |
| (*) `DATABASE_URL` | Postgres 16+ — `postgresql://user:pass@host:5432/dbname` |
| `FEEDBACK_SECRET` / `VIGIL_BOT_URL` | Solo si activas la página `/feedback` |
| `TURNSTILE_*` | Solo si quieres anti-bot Cloudflare en `/feedback` |

### Paso 4 — Levantar

**Opción A: Docker Compose** (recomendado para empezar)

```bash
docker compose up -d
# Espera ~30 segundos para que Postgres + app arranquen
# Visita http://localhost:3000
```

`docker-compose.yml` levanta Postgres + app + Nginx. Para producción real con TLS, usa Caddy/Traefik o un PaaS gestionado (Coolify, Fly, Railway).

**Opción B: Coolify**

1. Coolify → Resource → Application → Public Repository.
2. Repositorio: `https://github.com/Crinlorite/avalon-tracker`, rama `main`.
3. Build Pack: Dockerfile (auto-detectado).
4. Pegamento: las env vars de `.env.example`.
5. Postgres: Coolify → Resource → Database → PostgreSQL 16. Coge la `DATABASE_URL` resultante.
6. Domain: tu dominio + Cloudflare DNS-only (no proxy — causa redirect loops con NextAuth).
7. Deploy.

### Paso 5 — Primer arranque

El Dockerfile CMD ejecuta:

```bash
npx prisma db push --accept-data-loss   # crea tablas si no existen
npx tsx scripts/seed-zones.ts           # idempotente, importa zonas Avalon
node server.js
```

⚠️ **El primer deploy crea las tablas desde cero.** Si quieres migrations versionadas, sustituye `db push` por `prisma migrate deploy` después de generar el historial de migraciones contra una BD staging.

### Paso 6 — Crear tu clan en la app

1. Login con Discord (debes ser owner / "manage guild" del servidor que vas a registrar).
2. Dashboard → **+ Crear clan** → ID del guild Discord.
3. Settings → mapear roles de Discord a roles de la app (VIEWER/CONTRIBUTOR/EDITOR/ADMIN).
4. Settings → Anchor zone (la zona Avalon donde estará vuestra HO).
5. Settings → Webhook URL del canal Discord donde queréis los push de rutas.

Listo. Cualquier miembro del guild Discord podrá entrar tras el OAuth.

---

## Desarrollo local

Sin Docker:

```bash
npm install
cp .env.example .env  # rellena al menos las (*) y apunta DATABASE_URL a un Postgres local o staging

# (Si no tienes Vigil Bot real desplegado:)
npm run mock-bot      # mock en :4000

# En otra terminal:
npx prisma generate   # cliente Prisma
npm run dev           # Next.js en :3000
```

### Tests

```bash
npm test              # Vitest sobre libs puras
```

### Scripts útiles

| Comando | Acción |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Build producción (Node ≥20) |
| `npm run start:prod` | `server.js` (Next.js + timer) |
| `npm run mock-bot` | Mock de Vigil Bot en :4000 |
| `npm run seed:zones` | Seed Zone desde JSON |

---

## Estructura del proyecto

```
avalon-tracker/
├── prisma/
│   └── schema.prisma          # User, Clan, ClanMember, ClanRoleMapping,
│                              # Route, RouteHop (con soft-delete TTL 2d),
│                              # Zone, AuditLog
├── scripts/
│   ├── seed-zones.ts          # Seed de zonas (idempotente)
│   └── mock-vigil-bot.ts      # Mock para dev local
├── src/
│   ├── app/
│   │   ├── page.tsx           # Landing pública (Discord login)
│   │   ├── feedback/          # Form de feedback (público)
│   │   ├── (auth)/            # Rutas autenticadas
│   │   │   ├── dashboard/
│   │   │   ├── profile/
│   │   │   └── clan/[clanId]/
│   │   │       ├── page.tsx   # Vista grafo
│   │   │       ├── list/      # Vista lista
│   │   │       ├── trash/     # Papelera (recuperación TTL)
│   │   │       ├── settings/  # Webhook, anchor, role mappings
│   │   │       ├── members/   # Lista de miembros + roles
│   │   │       └── audit/     # Audit log (ADMIN only)
│   │   ├── legal/             # Legales (privacidad, cookies, aviso)
│   │   └── api/               # Endpoints REST
│   ├── components/
│   ├── hooks/
│   ├── i18n/                  # 25 idiomas (en/es nativos, resto beta)
│   ├── lib/
│   └── data/                  # world-meta.json (zonas + adyacencias)
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

---

## API Endpoints (resumen)

Todos los endpoints autenticados verifican rol del clan via `requireRole`. **No hay bypass** — el modelo es estrictamente per-clan.

### API v1 (app móvil y enlaces) — sesión web o `Authorization: Bearer <token de dispositivo>`
- `POST /api/v1/devices/link` (sesión) · `POST /api/v1/devices/claim` · `GET /api/v1/devices` · `DELETE /api/v1/devices/:id`
- `POST /api/v1/guest` · `GET /api/v1/me` · `POST /api/v1/me/merge`
- `GET|POST /api/v1/maps` · `GET /api/v1/maps/:id` · `GET|POST /api/v1/maps/:id/changes` (sincronización: el servidor manda)
- `GET|POST /api/v1/maps/:id/shares` · `DELETE /api/v1/maps/:id/shares/:shareId` · `GET /api/v1/shares/:token` · `POST /api/v1/shares/:token/join`
- `POST /api/v1/import` (código v1 de la app)

### API pública de zonas — sin cuenta, solo lectura, CORS abierto, 60 peticiones/min por IP

- `GET /api/v1/zones` — índice de las 400 zonas (nombre, slug, tier, familia, recursos, cofres, mazmorras). `ETag`; caché 1 h.
- `GET /api/v1/zones/{nombre|slug}` — ficha completa: recursos con tier de nodo, cofres con categorías de botín (sin porcentajes), mazmorras, bichos, minimapa esquemático.
- `GET /api/v1/zones/{nombre|slug}/prices?server=europe&enchant=0` — precios de los recursos de la zona en Lymhurst, Martlock, Thetford, Bridgewatch, Fort Sterling, Caerleon y Brecilien, desde la caché horaria de [AODP](https://www.albion-online-data.com/) (`sellMin` = oferta de venta más baja, `buyMax` = mejor orden de compra; `null` = sin dato; `fetchedAt` = última descarga). Servidores: `west`, `europe`, `east`.

Datos del juego © Sandbox Interactive, vía `ao-data/ao-bin-dumps`; precios del Albion Online Data Project. Si construyes algo con esta API, cítala.

### Sesión / usuario
- `GET /api/me` — perfil propio
- `GET /api/me/clans` — clanes a los que perteneces

### Clanes
- `POST /api/clans` — crear clan (validado contra Vigil Bot)
- `GET/PATCH/DELETE /api/clans/:clanId` — VIEWER / ADMIN / ADMIN
- `GET /api/clans/:clanId/members` — VIEWER
- `PATCH /api/clans/:clanId/anchor-status` — CONTRIBUTOR (parte de seguridad)

### Rutas
- `GET /api/clans/:clanId/routes?status=&since=` — VIEWER (soporte delta)
- `POST /api/clans/:clanId/routes` — CONTRIBUTOR
- `PATCH /api/clans/:clanId/routes/:id` — CONTRIBUTOR (con `If-Match: v=N`)
- `DELETE /api/clans/:clanId/routes/:id?hops=...` — EDITOR (soft-delete o hops parciales)
- `POST /api/clans/:clanId/routes/:id/restore` — EDITOR (recuperar de la papelera)
- `POST /api/clans/:clanId/routes/:id/discord-push` — CONTRIBUTOR (multipart con imagen opcional)

### Zonas / pathfinding
- `GET /api/zones?q=` — autocomplete
- `GET /api/zones/:id/routing` — pathfinding precomputed

### Webhooks entrantes (Vigil Bot → Tracker, HMAC-SHA256)
- `POST /api/webhooks/vigil/role-change`
- `POST /api/webhooks/vigil/member-leave`
- `POST /api/webhooks/vigil/guild-update`

### Health
- `GET /api/health` → `{ db, vigilBot, uptime }`

---

## Seguridad

- **Discord OAuth** con scopes mínimos (`identify email`).
- **JWT cookie** `authjs.session-token` HttpOnly + Secure (en prod).
- **Webhooks entrantes** verifican HMAC-SHA256 con `timingSafeEqual` + ventana de freshness 5 min.
- **Rate limits** en endpoints críticos (callback OAuth, POST/PATCH rutas, zones, etc).
- **Headers de seguridad** (next.config.ts): X-Frame-Options DENY, X-Content-Type-Options nosniff, Permissions-Policy, CSP estricto.
- **RBAC estricto per-clan** — los roles están scoped al clan donde se otorgan; cada clan es una unidad de privacidad estanca.
- **Soft-delete con TTL** — borrar rutas no las hace desaparecer instantáneamente (2 días de gracia).
- **Audit log per-clan** — ADMIN ve quién hizo qué en SU clan.

---

## Fuentes de datos

- World-graph (zonas + adyacencias): [broderickhyman/ao-bin-dumps](https://github.com/broderickhyman/ao-bin-dumps) procesado con un script de extracción local que aplica overrides manuales para corregir errores del dump tras parches del juego.
- Información de portales: [Wiki — Roads of Avalon](https://wiki.albiononline.com/wiki/Roads_of_Avalon).

Refresco de datos tras parches del juego: actualmente manual, ver `src/data/world-meta.json` en este repo.

---

## Contribuir

**Pull requests no se aceptan.** El proyecto lo mantengo yo en solitario y prefiero no integrar contribuciones directas — la responsabilidad de lo que se merge tiene que recaer en una sola voz para que la dirección quede consistente.

**Issues sí.** Reportes y propuestas son bienvenidos:
- `bug` — algo no funciona como debería
- `enhancement` — idea concreta para añadir / mejorar
- `language` — error o falta de traducción en idiomas beta

Si quieres tocar el código (cambiar comportamiento, añadir features, adaptarlo a tu clan), **forkéalo**: la licencia MIT te lo permite sin restricciones. Mantén tu fork con tus cambios y deplóyalo bajo tu control. Si descubres un bug genérico que afecta también al upstream, abre un issue aquí con el detalle y lo evalúo.

---

## Licencia

MIT — ver [`LICENSE`](LICENSE). Eres libre de usar, modificar, distribuir y vender. Solo se pide mantener el aviso de copyright.

Hecho con 🌀 por [Crintech Studios](https://crintech.pro). Si lo despliegas para tu clan, encantado de saberlo — abre un issue y lo añadimos al README como "deployments en el wild".
