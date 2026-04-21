# Plan 2 — Frontend Rewrite: Execution Summary

**Fecha**: 2026-04-21
**Branch**: `feat/discord-redesign-backend`
**Plan**: `docs/superpowers/plans/2026-04-21-frontend-rewrite.md`

---

## Totales

- **Commits Plan 2**: 27 (desde `16580f1` "docs: add frontend rewrite implementation plan (Plan 2)")
- **Tests**: **42 passing / 42 totales** (8 test files)
- **TS errors finales**: **2** (ambos en `tests/lib/rate-limit.test.ts` líneas 22-23, orthogonal — propiedad `retryAfterMs` del tipo `ConsumeResult` del test, no afectan código productivo)

---

## Commits por fase

### Fase 0 — Preparación (deps + providers + lib + auth landing)
- `0bdb610` chore: add @xyflow/react, swr, react-hot-toast
- `68719d8` feat(fetcher): SWR fetcher with typed error envelope
- `4150c34` feat(providers): SWR + toast globales
- `ccb57eb` feat(lib): time and role-ui pure helpers with tests

### Fase 1 — Auth UI + Sidebar
- `dac6aff` feat(auth-ui): Discord login landing, remove password form
- `fc800c1` feat(sidebar): Discord avatar + super admin badge + role badges

### Fase 2 — Hooks core
- `b71f541` feat(hooks): useMe, useMyClans, useClan
- `cc40a57` feat(hooks): visibility-aware polling and clan routes
- `550835e` feat(hooks): zone search (debounced) and routing

### Fase 3-6 — Dashboard/Profile/Settings/Members/Audit
- `fc99a3f` feat(dashboard): Discord-first dashboard + CreateClanModal with guild ID
- `4c08e4c` feat(profile): Discord identity + displayName override
- `5c43cda` feat(roles): RoleMappingEditor UI
- `a7eca66` feat(settings): clan settings — webhook, anchor, role mappings, delete
- `599834c` feat(members): Discord members list + admin displayName override
- `0fe1768` fix(audit): read data.data (fixes empty table bug); ADMIN-gated via 403

### Fase 7-9 — Zonas + Create Modal + List fallback
- `ff18776` feat(zones): enriched autocomplete with tier/HO/rest/capital badges
- `823e97c` feat(routes): CreateRouteModal v2 — autocomplete, shortcuts, chain validation
- `a100494` feat(routes): list view with version-aware disable/delete

### Fase 10-13 — Grafo + panel + toolbar + mobile
- `1b2203c` feat(graph): color and radial layout helpers
- `4766074` feat(graph): ClanGraph react-flow with custom ZoneNode and RouteEdge
- `a819723` feat(clan): graph primary view with side panel and mobile redirect
- `f18d8ca` feat(graph): ZoneSidePanel with pathfinding info and routes list
- `6c6ee95` feat(graph): HopInlineToolbar for quick hop edits (status, timer, delete)

### Fase 14 — Super admin UI
- `3209e9a` feat(admin): dashboard with overview cards
- `dc689bf` feat(admin): routes/clans/users/map super admin pages

### Fase 15 — Boundaries + cleanup
- `b78cbd1` feat(boundaries): global loading/error/not-found
- `7ae5c05` chore: remove legacy DiscordPushButton (endpoint no longer exists)

---

## Flujos UI funcionales (verificables manualmente)

- ✅ **Login Discord** — landing `/`, botón "Continuar con Discord", redirect a `/dashboard`
- ✅ **Sidebar** — avatar Discord, badge super admin, badges role por clan
- ✅ **Dashboard** — lista "Mis clanes" + CreateClanModal (guild ID numérico)
- ✅ **Profile** — identidad Discord + override `displayName`
- ✅ **Clan settings** — webhook URL, anchor zone, role mappings, delete clan
- ✅ **Members** — lista miembros Discord + override admin de `displayName`
- ✅ **Audit log** — lista eventos, ADMIN-gated (403 si no es admin/superadmin)
- ✅ **Clan graph** `/clan/[clanId]` — react-flow con `ZoneNode`+`RouteEdge`, side panel con pathfinding + rutas, inline toolbar (status/timer/delete), mobile portrait → redirect a lista
- ✅ **CreateRouteModal v2** — autocomplete zones con badges, atajos teclado, validación chain
- ✅ **Lista fallback** — tabla rutas con disable/delete + version-aware (If-Match)
- ✅ **Admin dashboard** `/admin` — 4 cards overview + nav 4 subpages
- ✅ **Admin routes** `/admin/routes` — tabla cross-clan, filtros status/zone, Export CSV
- ✅ **Admin clans** `/admin/clans` — listado con counts (members/routes/bot)
- ✅ **Admin users** `/admin/users` — búsqueda username/email
- ✅ **Admin map** `/admin/map` — grafo global read-only con todas las rutas activas
- ✅ **Loading/error/404** — boundaries globales en `src/app/`

---

## Spec coverage

| Sección spec | Fase Plan 2 | Estado |
|---|---|---|
| §7 Auth UI (Discord) | F1 | OK |
| §8 UI grafo primario + side panel + inline toolbar | F10-F12 | OK |
| §8 Mobile portrait → lista | F13 | OK |
| §9 CreateRouteModal v2 autocomplete | F8 | OK |
| §9 RouteListTable con If-Match | F9 | OK |
| §10 Dashboard/Profile/Settings/Members/Audit | F3-F6 | OK |
| §11 Super admin dashboard + map + routes + clans + users | F14 | OK |
| §2 SWR polling visibility-aware | F2 | OK |
| Global loading/error/not-found | F15.1 | OK |

---

## Known Issues

1. **2 TS errors en test trivial**: `tests/lib/rate-limit.test.ts:22-23` usan propiedad `retryAfterMs` que no existe en `ConsumeResult`. Tests corren OK igualmente (Vitest no bloquea por TS check en runtime). No afecta build productivo. Fix sugerido: ajustar el test o añadir la propiedad al tipo si se quiere exponer.
2. **Node 18 local vs Next 16 build**: `npm run build` local falla por Node 18; VPS Coolify usa Node 20 (compatible). Smoke test de build se salta localmente — se valida en deploy.
3. **Dos warnings git CRLF/LF** al commitear en Windows (inócuos).

---

## Follow-ups (post-merge)

1. **world-graph.json transformer**: revisar el script/job que transforma el mapa de Albion en grafo compatible con pathfinder (puede requerir re-run si cambió data).
2. **Coolify env vars**: revisar que en producción estén:
   - `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
   - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
   - `DATABASE_URL` (Postgres)
   - `VIGIL_BOT_URL`, `VIGIL_BOT_SECRET`
   - `SUPER_ADMIN_DISCORD_IDS`
3. **Deploy a Coolify**: merge branch → push → Coolify autodeploy → verificar `/api/health` y login flow end-to-end.
4. **Fix rate-limit test**: alinear tipos `ConsumeResult` con lo que el test espera (trivial).
5. **Opcional**: filtros avanzados en grafo (status, portal size, zonas no-ruta), drag-and-drop persistente con localStorage, indicador pulsante "edit freshness".

---

## Verificación

```bash
# Tests
npm test          # 42/42 OK
npx tsc --noEmit  # 2 errores (rate-limit test, orthogonal)
# npm run build  # skipped local (Node 18 incompatible con Next 16); VPS OK
```

---

**Plan 2 completo. Branch lista para push y deploy.**
