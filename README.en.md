> 🌐 **README en castellano:** [README.md](README.md) — mismo contenido en español.

# Avalon Tracker

Collaborative tool for mapping the **Roads of Avalon** (Caminos de Avalon) of Albion Online among members of a clan. Primary view is an **interactive graph** with live timers, pathfinding to exits towards Royal Cities / Rests, and Discord notifications.

> **Open source · MIT** — the code is free. The public deployment at [avalontracker.app](https://avalontracker.app) is run by me (Crintech Studios), but **I encourage you to spin up your own private portal** for your clan: that way the sensitive information (routes, anchors, security reports) **stays under your own key**, with no third party — not even me — seeing anything.

---

## Why run my own portal?

- **Full privacy** — your routes, anchors, security reports and tickets live in your Postgres, not mine.
- **No dependency on my VPS** — if I stop paying for hosting or change the domain, your clan keeps working.
- **Personalisation** — branding, extra languages, your own integrations with your Discord. The code is yours.
- **Trust by code** — nothing in this repo is secret. Audit what you deploy.
- **Minimal cost** — a small VPS plus a shared Postgres is enough for a clan of up to 200 people.

---

## Main features

### Public part (no account)
- **`/zones`**: all 400 Roads of Avalon zones with search and filters (tier, resource, chest, dungeon, class, hideout). **`/zones/<zone>`**: indexable page with mini-map, resources with node tiers, chests by quality and size, dungeons and similar zones. English, plus Spanish under `/es/...`.
- **`/exits`**: "where did I come out?" → nearest royal city and royal portals from any world zone.
- Data extracted from the game files: see [`src/data/README.md`](src/data/README.md).

### Personal maps (no Discord)
- **`/map`** creates a personal map in one click, with no account: a **guest account** linked to the browser is opened.
- Signing in with Discord later **moves the guest's maps to the real account** (10-minute signed cookie + merge in the Discord callback).
- A personal map can be **turned into a guild map** (same requirements as creating a clan: Vigil Bot + owner/admin of the server). Same id, same routes.
- Guests with no activity for 30 days are deleted with their maps. Up to 3 personal maps per person.

### Discord-native authentication
- Login with **Discord OAuth** (minimal scopes: `identify email`). No passwords, no Google.
- **Vigil Bot** (sibling service) acts as the role authority and notification emitter. Avalon Tracker does not talk to the Discord API directly — everything goes through the bot.
- JWT sessions (NextAuth v5), 14-day persistent cookie.

### Clan roles (4 hierarchical levels)
| Level | Enum | UI EN | Can |
|:-:|---|---|---|
| 4 | `ADMIN` | Admin | Everything (manage clan, roles, webhook, deletes) |
| 3 | `EDITOR` | Editor | Create + edit + delete routes |
| 2 | `CONTRIBUTOR` | Contributor | Create + edit (no deletes) |
| 1 | `VIEWER` | Viewer | Read-only |

**Many-to-many** mapping from Discord roles. A user with several mapped roles gets the highest one. Admins configure it from the clan Settings page.

**The clan creator is always ADMIN** (cannot be downgraded even if their Discord roles change).

### Interactive graph
- `@xyflow/react` with custom nodes (zones with T-tier badges, HO, Rest, Capital, and a border keyed to PvP type) and custom edges (thickness by portal size, colour by remaining time).
- Configurable clan **anchor zone** — the fixed point routes branch from.
- Anchor **security report** (green/yellow/red traffic light), editable by any CONTRIBUTOR+.
- Multi-tree top-down layout with dagre, straight edges, 45° angles at branches.
- Drag-and-drop node positions persisted in `localStorage` per clan.
- Click on a timer → edit time manually. Click on a zone → side panel with pathfinding + actions.

### Alternative list view
- `/clan/[id]/list`: table with filters, route merging, push to Discord, copy as image.
- Each route may have **internal branches** that the list flattens into independent rows.
- **Soft-delete with 2-day TTL** (recoverable from the **Trash**).

### Pathfinding with the game dump
- World-graph extracted from [`broderickhyman/ao-bin-dumps`](https://github.com/broderickhyman/ao-bin-dumps) and processed with a local extraction script.
- Runtime BFS to find the **2 nearest portals** from a black zone and the **nearest royal city** from any non-royal-city.
- Data lives in `src/data/world-meta.json` — refreshable after game patches.

### Discord sharing
- Per-clan webhook, configurable.
- Push routes as **embed + PNG image** generated client-side (html-to-image) with the "Avalon Tracker by Crintech Studios" branding (you can change it on your fork).
- Each route can be **copied as an image to the clipboard** without going through Discord.
- Closing time shown in **Albion Time (UTC+0)** plus the local timezone of the sharer, with auto DST detection.

### Other
- 25 languages (English and Spanish are native, the rest are beta).
- Per-clan audit log accessible only to ADMINs of that clan.
- Feedback / ticket system through Vigil Bot.

---

## Permission model

**Strict per-clan RBAC.** Each clan is a self-contained privacy unit: the ADMIN role is scoped to the clan where it is granted, not to the system. To see a clan's content you must be a member of that clan with the role its ADMIN gave you.

This means **not even the server operator** (you, if you self-host) has cross-clan visibility through the application. You can hit Postgres directly for raw data — but no UI or API helps you do it.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind v4 |
| Graph | `@xyflow/react` + dagre layout |
| Data fetching | SWR 2.x with visible / background polling |
| Auth | NextAuth v5 + Discord provider |
| DB | PostgreSQL 16 + Prisma v7 (PrismaPg adapter) |
| Discord | OAuth + Vigil Bot (HTTP + HMAC webhooks) |
| Deploy | Docker multi-stage |

---

## Self-host: a private portal for your clan

This section assumes Linux + Docker. Adapt to your infra (Coolify, Fly, Railway, k8s, whatever).

### Step 1 — Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. **OAuth2 → General** tab: copy the **Client ID** and **Client Secret**.
3. Add the redirect URI: `https://YOUR-DOMAIN/api/auth/callback/discord` (or `http://localhost:3000/...` for dev).

### Step 2 — Vigil Bot

Avalon Tracker requires a running **Vigil Bot**. It is a sibling service that:
- Resolves Discord guild roles (the authority).
- Emits webhooks when someone leaves the guild or changes role.
- Routes feedback tickets into a Discord channel of the clan.

```bash
git clone https://github.com/Crinlorite/vigil-discordbot.git
cd vigil-discordbot
# Follow its README to add the bot to your Discord guild
# and deploy it. Point VIGIL_BOT_API_URL at its URL.
```

### Step 3 — Environment variables

```bash
git clone https://github.com/Crinlorite/avalon-tracker.git
cd avalon-tracker
cp .env.example .env
```

Edit `.env`. The ones marked **(*) are mandatory**:

| Variable | How to get it |
|---|---|
| (*) `AUTH_SECRET` | `openssl rand -base64 32` |
| (*) `AUTH_URL` | Public URL of the site (e.g. `https://avalon.myclan.org`) |
| `NEXT_PUBLIC_APP_URL` | Same as `AUTH_URL`, exposed to the client |
| (*) `DISCORD_CLIENT_ID` / `_SECRET` | From the Discord Developer Portal (Step 1) |
| (*) `VIGIL_BOT_API_URL` | URL of the bot reachable from the server |
| (*) `VIGIL_BOT_SHARED_SECRET` | `openssl rand -hex 32` (same value on bot and app) |
| (*) `DATABASE_URL` | Postgres 16+ — `postgresql://user:pass@host:5432/dbname` |
| `FEEDBACK_SECRET` / `VIGIL_BOT_URL` | Only if you enable the `/feedback` page |
| `TURNSTILE_*` | Only if you want Cloudflare anti-bot on `/feedback` |

### Step 4 — Bring it up

**Option A: Docker Compose** (recommended to start)

```bash
docker compose up -d
# Wait ~30 seconds for Postgres + the app to come up
# Visit http://localhost:3000
```

`docker-compose.yml` brings up Postgres + the app + Nginx. For real production with TLS, use Caddy/Traefik or a managed PaaS (Coolify, Fly, Railway).

**Option B: Coolify**

1. Coolify → Resource → Application → Public Repository.
2. Repo: `https://github.com/Crinlorite/avalon-tracker`, branch `main`.
3. Build pack: Dockerfile (auto-detected).
4. Glue: env vars from `.env.example`.
5. Postgres: Coolify → Resource → Database → PostgreSQL 16. Use the resulting `DATABASE_URL`.
6. Domain: your domain plus Cloudflare DNS-only (no proxy — it causes redirect loops with NextAuth).
7. Deploy.

### Step 5 — First boot

The Dockerfile CMD runs:

```bash
npx prisma db push --accept-data-loss   # creates tables if missing
npx tsx scripts/seed-zones.ts           # idempotent, imports Avalon zones
node server.js
```

⚠️ **The first deploy creates the tables from scratch.** If you want versioned migrations, replace `db push` with `prisma migrate deploy` once you have generated the migration history against a staging DB.

### Step 6 — Create your clan in the app

1. Log in with Discord (you must be the owner / "manage guild" of the server you are about to register).
2. Dashboard → **+ New clan** → Discord guild ID.
3. Settings → map Discord roles to app roles (VIEWER/CONTRIBUTOR/EDITOR/ADMIN).
4. Settings → anchor zone (the Avalon zone where your HO will sit).
5. Settings → webhook URL of the Discord channel where you want route pushes.

Done. Any member of the Discord guild can sign in via OAuth.

---

## Local development

Without Docker:

```bash
npm install
cp .env.example .env  # fill at least the (*) values; point DATABASE_URL at a local or staging Postgres

# (If you don't have a real Vigil Bot deployed:)
npm run mock-bot      # mock on :4000

# In another terminal:
npx prisma generate   # Prisma client
npm run dev           # Next.js on :3000
```

### Tests

```bash
npm test              # Vitest over pure libs
```

### Useful scripts

| Command | Action |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (Node ≥20) |
| `npm run start:prod` | `server.js` (Next.js + timer) |
| `npm run mock-bot` | Vigil Bot mock on :4000 |
| `npm run seed:zones` | Seed Zone from JSON |

---

## Project structure

```
avalon-tracker/
├── prisma/
│   └── schema.prisma          # User, Clan, ClanMember, ClanRoleMapping,
│                              # Route, RouteHop (with 2d soft-delete TTL),
│                              # Zone, AuditLog
├── scripts/
│   ├── seed-zones.ts          # Zone seed (idempotent)
│   └── mock-vigil-bot.ts      # Mock for local dev
├── src/
│   ├── app/
│   │   ├── page.tsx           # Public landing (Discord login)
│   │   ├── feedback/          # Public feedback form
│   │   ├── (auth)/            # Authenticated routes
│   │   │   ├── dashboard/
│   │   │   ├── profile/
│   │   │   └── clan/[clanId]/
│   │   │       ├── page.tsx   # Graph view
│   │   │       ├── list/      # List view
│   │   │       ├── trash/     # Trash (TTL recovery)
│   │   │       ├── settings/  # Webhook, anchor, role mappings
│   │   │       ├── members/   # Member list + roles
│   │   │       └── audit/     # Audit log (ADMIN only)
│   │   ├── legal/             # Legal pages (privacy, cookies, notice)
│   │   └── api/               # REST endpoints
│   ├── components/
│   ├── hooks/
│   ├── i18n/                  # 25 languages (en/es native, rest beta)
│   ├── lib/
│   └── data/                  # world-meta.json (zones + adjacencies)
├── Dockerfile
├── docker-compose.yml
└── nginx.conf
```

---

## API endpoints (overview)

Every authenticated endpoint validates the clan role through `requireRole`. **There is no bypass** — the model is strictly per-clan.

### API v1 (mobile app and links) — web session or `Authorization: Bearer <device token>`
- `POST /api/v1/devices/link` (session) · `POST /api/v1/devices/claim` · `GET /api/v1/devices` · `DELETE /api/v1/devices/:id`
- `POST /api/v1/guest` · `GET /api/v1/me` · `POST /api/v1/me/merge`
- `GET|POST /api/v1/maps` · `GET /api/v1/maps/:id` · `GET|POST /api/v1/maps/:id/changes` (sync: the server wins)
- `GET|POST /api/v1/maps/:id/shares` · `DELETE /api/v1/maps/:id/shares/:shareId` · `GET /api/v1/shares/:token` · `POST /api/v1/shares/:token/join`
- `POST /api/v1/import` (app share code, format v1)

### Session / user
- `GET /api/me` — own profile
- `GET /api/me/clans` — clans you belong to

### Clans
- `POST /api/clans` — create a clan (validated against Vigil Bot)
- `GET/PATCH/DELETE /api/clans/:clanId` — VIEWER / ADMIN / ADMIN
- `GET /api/clans/:clanId/members` — VIEWER
- `PATCH /api/clans/:clanId/anchor-status` — CONTRIBUTOR (security report)

### Routes
- `GET /api/clans/:clanId/routes?status=&since=` — VIEWER (delta-friendly)
- `POST /api/clans/:clanId/routes` — CONTRIBUTOR
- `PATCH /api/clans/:clanId/routes/:id` — CONTRIBUTOR (with `If-Match: v=N`)
- `DELETE /api/clans/:clanId/routes/:id?hops=...` — EDITOR (soft-delete or partial hops)
- `POST /api/clans/:clanId/routes/:id/restore` — EDITOR (restore from the trash)
- `POST /api/clans/:clanId/routes/:id/discord-push` — CONTRIBUTOR (multipart with optional image)

### Zones / pathfinding
- `GET /api/zones?q=` — autocomplete
- `GET /api/zones/:id/routing` — precomputed pathfinding

### Inbound webhooks (Vigil Bot → Tracker, HMAC-SHA256)
- `POST /api/webhooks/vigil/role-change`
- `POST /api/webhooks/vigil/member-leave`
- `POST /api/webhooks/vigil/guild-update`

### Health
- `GET /api/health` → `{ db, vigilBot, uptime }`

---

## Security

- **Discord OAuth** with minimal scopes (`identify email`).
- **JWT cookie** `authjs.session-token`, HttpOnly + Secure (in prod).
- **Inbound webhooks** verify HMAC-SHA256 with `timingSafeEqual` plus a 5-minute freshness window.
- **Rate limits** on critical endpoints (OAuth callback, route POST/PATCH, zones, etc.).
- **Security headers** (next.config.ts): X-Frame-Options DENY, X-Content-Type-Options nosniff, Permissions-Policy, strict CSP.
- **Strict per-clan RBAC** — roles are scoped to the clan where they are granted; each clan is a self-contained privacy unit.
- **Soft-delete with TTL** — deleting routes does not blow them away instantly (2-day grace period).
- **Per-clan audit log** — ADMINs see who did what in THEIR clan.

---

## Data sources

- World-graph (zones + adjacencies): [broderickhyman/ao-bin-dumps](https://github.com/broderickhyman/ao-bin-dumps) processed with a local extraction script that applies manual overrides to fix dump errors after game patches.
- Portal information: [Wiki — Roads of Avalon](https://wiki.albiononline.com/wiki/Roads_of_Avalon).

Refreshing data after a game patch is currently manual — see `src/data/world-meta.json` in this repo.

---

## Contributing

**Pull requests are not accepted.** I maintain this project solo and prefer not to integrate direct contributions — responsibility for what gets merged has to sit with a single voice so the direction stays consistent.

**Issues are welcome.** Reports and proposals are appreciated:
- `bug` — something is not working as it should
- `enhancement` — a concrete idea to add or improve something
- `language` — a translation error or gap in beta languages

If you want to touch the code (change behaviour, add features, adapt it to your clan), **fork it**: the MIT licence lets you do so without restrictions. Maintain your fork with your changes and deploy it under your own control. If you find a generic bug that affects upstream too, open an issue here with the details and I will look at it.

---

## Licence

MIT — see [`LICENSE`](LICENSE). You are free to use, modify, distribute and sell. The only ask is that you keep the copyright notice.

Made with 🌀 by [Crintech Studios](https://crintech.pro). If you deploy it for your clan, I would love to hear about it — open an issue and I will add it to the README under "deployments in the wild".
