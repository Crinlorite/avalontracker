# Plan de mejora — avalontracker

> Fecha: 2026-06-10 · Estado: activo · Prioridad de inversión: media · Stack: Next.js 16 (App Router) + React 19 + Tailwind 4 + Prisma 7 (PostgreSQL 16) + NextAuth v5 beta (Discord OAuth) + Docker/Coolify

## 1. Qué es

Herramienta colaborativa para mapear los Caminos de Avalon (Roads of Avalon) de Albion Online por clanes, con grafo interactivo (`@xyflow/react` + dagre), timers de portales, pathfinding sobre el world-graph del juego y integración Discord (OAuth + Vigil Bot como autoridad de roles + webhooks por clan). Es open source (MIT) con guía de self-host; la instancia pública corre en **avalontracker.app** desplegada con Docker en Coolify (el dominio migró de `crintech.pro` a `.app` en el commit `8ae5250`). RBAC estricto per-clan en 4 niveles (VIEWER/CONTRIBUTOR/EDITOR/ADMIN), sin visibilidad cross-clan por diseño.

**Nota de contexto importante:** el subsistema de ingest automatizada (endpoints `/api/ingest/zone-change` y `/api/ingest/portal-snapshot`, tokens personales y helpers) **fue eliminado del repo público** en el commit `a29a1f6` (2026-05-08, "chore: eliminar subsistema de ingest automatizada del repo público"); según el propio mensaje de commit, ese código vive ahora en un repo privado de archivo. Como el deploy de producción sale de `main` de este repo, la instancia desplegada ya no expone esos endpoints — los companions (Loot Vigil, extensión OCR) que apuntaban ahí quedan sin destino salvo que se despliegue desde el archivo privado.

## 2. Diagnóstico

Estado general: **sano**. Working tree limpio, 42 tests en verde, sin secrets en el repo, seguridad por capas bien pensada (HMAC con `timingSafeEqual` + ventana de freshness, rate limiting, CSP/HSTS, RBAC con tests). Última actividad: 2026-05-10. Los problemas reales son de higiene, no estructurales.

### 2.1 Arquitectura y deuda técnica

- **`server.ts` es código muerto en su totalidad.** El servidor custom con Socket.IO + timer de expiración cada 30s (`server.ts`) no se ejecuta en ningún flujo: `npm run dev` lanza `next dev`, y el `Dockerfile` (CMD, línea 62) ejecuta `node server.js` **del output standalone de Next** (`output: "standalone"` en `next.config.ts`), que es el servidor generado por Next, no una compilación de `server.ts`. Además **no existe ni un solo uso de `socket.io-client` en `src/`** (verificado con grep): el "tiempo real" de la app es en realidad polling SWR (12 s visible / 60 s background, `src/hooks/useVisibilityPolling.ts` + `src/hooks/useClanRoutes.ts`), y la expiración de hops la cubre el barrido lazy del `GET` de rutas. Consecuencias: tres dependencias runtime innecesarias (`socket.io`, `socket.io-client`, `pino-http`), la cadena vulnerable de `ws` en `npm audit`, y un README que promete websockets que no existen.
- **Logger de diagnóstico temporal en `main` desde hace un mes.** El HEAD (`eae5e38`, 2026-05-10) es "diag(internal): logger temporal en role-mappings para cazar 403 fantasma". `src/app/api/internal/role-mappings/[guildId]/route.ts` (líneas 27-45) loggea en cada request los **primeros 6 caracteres del bearer recibido y del `VIGIL_BOT_SHARED_SECRET`**. Es material parcial de secreto yendo a logs de Coolify en cada llamada del bot. Hay que cerrar el diagnóstico (¿se cazó el 403?) y retirarlo.
- **Barrido de mantenimiento en cada GET de rutas.** `src/app/api/clans/[clanId]/routes/route.ts` (líneas 44-116) ejecuta en **cada** poll de **cada** miembro: 1 `findMany` + transacción condicional + 3 `deleteMany`. Con polling a 12 s, un clan de 30 miembros activos genera ~10 queries de mantenimiento/segundo solo para ese clan. Las queries van con índice y son baratas, pero el churn escala con miembros × clanes. Un throttle per-clan (LRU con timestamp, 1 barrido/min máximo) lo reduce ~5× sin cambiar semántica.
- **Datos duplicados/huérfanos:** `public/world-graph.json` (148 KB) no lo referencia nada en `src/` ni `scripts/` (el script `scripts/import-world-graph.ts` lee `src/data/world-graph.json`) y además **su contenido difiere** del de `src/data/` (md5 distintos). Es un asset muerto, desincronizado y servido públicamente.
- **Restos de boilerplate create-next-app:** `public/next.svg`, `public/vercel.svg`, `public/file.svg`, `public/globe.svg`, `public/window.svg`.
- **`public/og-image.svg` (456 KB)** es un intermedio de build de `scripts/render-og.mjs` (el metadata solo usa `og-image.png`); se sirve públicamente sin necesidad.
- **Inconsistencias de naming tras el rename del repo:** `package.json` sigue siendo `"name": "avalon-tracker"`, y `README.md`/`README.en.md` (líneas 120-121, 154, 222) aún clonan `Crinlorite/avalon-tracker` cuando el remote real es `Crinlorite/avalontracker` (GitHub redirige, pero conviene alinear; el feedback ya se alineó en `890c919`).
- **`npm run seed` probablemente roto:** invoca `npx prisma db seed`, pero `prisma.config.ts` no define `seed` (el comentario dice "run manually with npx tsx prisma/seed.ts" y el fichero real es `scripts/seed.ts`).
- **Dockerfile copia `node_modules` completo** (línea 49) al runner, incluyendo devDependencies (typescript, eslint, vitest…). Necesario en parte porque el CMD usa `tsx` para los scripts de arranque, pero se puede podar con un stage `npm ci --omit=dev` y dejar la imagen bastante más ligera.

### 2.2 Calidad: tests, docs, tooling

- **Tests: 42 en verde** (`npm test`, Vitest 3): `tests/lib/` (hmac, permissions, rate-limit, version-check, vigil-bot-client), `tests/hooks/` (role-ui, time) y `scripts/__tests__/precompute-routing.test.ts`. Cubren las libs puras críticas (RBAC, HMAC) — buena elección. **Hueco principal:** la lógica más intrincada del sistema (el barrido lazy de 4 pasos en `routes/route.ts` y la máquina de estados soft-delete/TTL/resurrección documentada en `prisma/schema.prisma` líneas 266-288) no tiene tests; al vivir inline en el handler no es testeable sin BD.
- **Lint: 7 errores + 9 warnings** (`npm run lint`). Errores: `setState` síncrono dentro de effect (`src/contexts/LanguageContext.tsx:41` y dos más), `react/no-unescaped-entities` (`src/components/routes/AppendHopModal.tsx:111`), `prefer-const`, y un falso TDZ en `src/components/routes/RouteTimer.tsx:10` (`useState(() => calcTimeLeft())` antes de la declaración — funciona por hoisting pero conviene reordenar). Warnings: 8 variables sin usar repartidas en 6 ficheros + 1 `exhaustive-deps` en `RouteTimer.tsx`. Nada grave, pero un lint no-verde deja pasar regresiones futuras.
- **Docs: muy por encima de la media.** README ES + EN sincronizados (ambos tocados por última vez el 2026-05-09), guía completa de self-host, resumen de API, modelo de permisos, comentarios de código excelentes (el schema Prisma y el handler de rutas explican el porqué de cada decisión). Deriva menor: el README dice que `GET /api/health` devuelve `{ db, vigilBot, uptime }`, pero `src/app/api/health/route.ts` omite `uptime` deliberadamente (y el comentario del código explica bien por qué).
- **i18n:** 24 idiomas en `src/i18n/languages.ts` (11 internacionales + 6 regionales + 7 community); solo en/es son nativos y los otros 22 van con `withFallback` parcial en `translations.ts` — honesto (badge "beta" en UI).

### 2.3 Dependencias y seguridad

- **`npm audit`: 25 vulnerabilidades (2 críticas, 12 high, 11 moderate), todas transitivas y todas resolubles sin breaking changes:**
  - Críticas: `vitest`/`@vitest/ui` ≤3.2.5 (solo dev; arreglado en 3.2.6).
  - High: `@hono/node-server` y `chevrotain`/`lodash` vía `prisma@7.4.2` (CLI dev; arreglado actualizando a `prisma`/`@prisma/client` 7.8.0).
  - Moderate: `ws` vía `socket.io`/`socket.io-client` — **dependencias runtime de código muerto**; eliminarlas mata la rama entera.
- **`npm outdated`: deriva menor.** prisma 7.4.2→7.8.0, next 16.1.6→16.2.9, zod 4.3.6→4.4.3, etc. `next-auth@5.0.0-beta.30` es canal beta — vigilar el paso a estable antes de subir a ciegas.
- **Sin secrets en el repo:** `.env` está en `.gitignore` y solo `.env.example` (con placeholders) está trackeado; `git grep` de patrones de credenciales solo encuentra el fixture de `tests/lib/hmac.test.ts`. Correcto.
- **Postura de seguridad sólida:** HMAC-SHA256 con `timingSafeEqual` + freshness 5 min en webhooks (`src/lib/hmac.ts`, `webhook-freshness.ts`), rate limiting LRU en endpoints críticos y en el callback OAuth (`src/middleware.ts`), CSP + HSTS + Permissions-Policy exhaustiva (`next.config.ts`), health endpoint que oculta uptime y se auto-rate-limita. Dos matices: (1) el rate limiting y la cache de roles (`src/lib/permissions.ts`, LRU 30 min) son **in-memory por proceso** — válido para single-instance, rompe si algún día se escala horizontal; (2) `script-src` lleva `'unsafe-eval'` — Next suele necesitarlo solo en dev, merece una prueba de retirarlo en prod.
- **`prisma db push --accept-data-loss` en cada arranque** (Dockerfile CMD): el README documenta el riesgo, pero un cambio de schema destructivo se aplicaría sin red de seguridad en producción.

### 2.4 SEO / rendimiento / accesibilidad

- **SEO: muy completo.** Metadata con canonical, OG/Twitter cards, JSON-LD `WebApplication`, `robots.ts` (bloquea crawlers de entrenamiento, permite buscadores), `sitemap.ts`, EN-primary para audiencia internacional (commit `3184498`), `manifest.json`. Poco que rascar.
- **Rendimiento:** Inter vía `next/font` (bien); `og-image.png` 200 KB aceptable; los 456 KB de `og-image.svg` y 148 KB de `world-graph.json` en `public/` son peso público gratuito.
- **Accesibilidad:** `viewport.maximumScale: 1` en `src/app/layout.tsx:92` **bloquea el pinch-zoom** (incumple WCAG 1.4.4) — retirar. El selector de idiomas agrupa regionales de España (català, galego, euskara…) junto a `"es": "Español"` en `languages.ts`; según la norma de la casa, en ese contexto el label debería ser **"Castellano"** (manteniendo el código ISO `es`).
- **Legales:** `src/app/legal/aviso-legal/page.tsx` declara "Crintech Studios, proyecto personal sin forma jurídica registrada" con email de contacto y sin domicilio — conforme a la Opción B vigente y a la norma de no publicar el domicilio. Recordatorio ya registrado: al formalizar autónomo/empresa, actualizar a Opción A.

## 3. Mejoras priorizadas

### P1 — hacer ya

1. **Retirar el logger de diagnóstico de role-mappings** — Está loggeando prefijos del bearer y del shared secret en cada request desde 2026-05-10. Cerrar el diagnóstico del "403 fantasma" (confirmar con logs del VPS si se cazó la causa: Traefik/CF vs handler) y eliminar el bloque de instrumentación (líneas 27-45) y el campo `reason` detallado del 401. Esfuerzo: **S**. Ficheros: `src/app/api/internal/role-mappings/[guildId]/route.ts`.
2. **Eliminar `server.ts` y sus dependencias muertas** — Borra `server.ts`, quita `socket.io`, `socket.io-client` y `pino-http` de dependencies, mueve `express` y `@types/express` a devDependencies (solo los usa `scripts/mock-vigil-bot.ts`), elimina el script `start:prod` engañoso de `package.json`, y ajusta README (sección "Real time"/stack: el mecanismo real es polling SWR con timers client-side). Beneficio doble: elimina la rama vulnerable de `ws` y deja la arquitectura documentada igual a la real. Esfuerzo: **M**. Ficheros: `server.ts`, `package.json`, `README.md`, `README.en.md`, `src/i18n/translations.ts` (claim "update instantly" si se quiere afinar).
3. **Actualizar dependencias y limpiar `npm audit`** — `prisma`/`@prisma/client`/`@prisma/adapter-pg` a 7.8.0 (mata los high de `@hono/node-server` y `chevrotain`), `vitest`/`@vitest/ui` a 3.2.6 (mata las 2 críticas dev), `next`/`eslint-config-next` a 16.2.x, resto de minors (`zod`, `pg`, `tsx`, `dotenv`). **No** subir `next-auth` más allá del canal beta sin leer el changelog. Verificar con `npm test` + build local + deploy en Coolify (sin CI). Esfuerzo: **S**. Ficheros: `package.json`, `package-lock.json`.
4. **Decidir y documentar la estrategia de ingest privada** — Tras `a29a1f6` la instancia pública desplegada desde `main` ya no tiene `/api/ingest/*`; Loot Vigil y la extensión OCR apuntaban ahí. Decisión pendiente: (a) desplegar la instancia propia desde el repo privado de archivo con el ingest restaurado, o (b) asumir entrada manual también en la instancia propia y retirar el token/integración del lado Loot Vigil. Sea cual sea, dejarlo escrito (nota interna, no en el README público) para que el ecosistema no quede apuntando a un endpoint inexistente. Esfuerzo: **M** (la decisión es lo caro). Ficheros: ninguno en este repo si se elige (b); repo privado de archivo si (a).

### P2 — siguiente tanda

5. **Lint a cero errores** — Arreglar los 7 errores (setState-en-effect en `LanguageContext.tsx` y 2 más, entidades sin escapar en `AppendHopModal.tsx:111`, `prefer-const`, reorden en `RouteTimer.tsx`) y limpiar los 9 warnings (8 variables sin usar + 1 `exhaustive-deps`). Esfuerzo: **S**. Ficheros: los listados por `npm run lint`.
6. **Throttle del barrido lazy per-clan** — LRU `clanId → lastSweepAt` con ventana de 60 s al inicio del `GET`; si el clan ya se barrió en la ventana, saltar los pasos 1-4. Reduce ~5× el write churn sin tocar semántica (el TTL es de días, no de segundos). Esfuerzo: **S**. Ficheros: `src/app/api/clans/[clanId]/routes/route.ts` (+ test unitario del helper).
7. **Extraer la lógica del barrido a una lib testeable** — Mover los 4 pasos de mantenimiento a `src/lib/route-sweep.ts` con el cliente Prisma inyectado, y testear la matriz de estados (expiración → soft-delete compartido, resurrección dentro del TTL, tombstones P2002) con un mock fino. Es la lógica más delicada del producto y hoy solo está protegida por comentarios. Esfuerzo: **M**. Ficheros: `src/app/api/clans/[clanId]/routes/route.ts`, nuevo `src/lib/route-sweep.ts` + test.
8. **Limpiar `public/`** — Borrar `world-graph.json` (huérfano y desincronizado de `src/data/`), los 5 SVG de boilerplate y hacer que `scripts/render-og.mjs` escriba el `og-image.svg` intermedio fuera de `public/` (p. ej. `scripts/.fonts/` ya ignorado, o tmp). Esfuerzo: **S**. Ficheros: `public/*`, `scripts/render-og.mjs`.
9. **Podar la imagen Docker** — Stage adicional con `npm ci --omit=dev` para el runner (manteniendo `tsx` y `prisma` que usa el CMD), en vez de copiar el `node_modules` completo del builder. Esfuerzo: **M**. Ficheros: `Dockerfile`.

### P3 — algún día

10. **Migrations versionadas** — Sustituir `prisma db push --accept-data-loss` del CMD por `prisma migrate deploy` tras generar el historial contra una BD staging (el propio README ya deja la puerta abierta). Elimina el riesgo de pérdida silenciosa en cambios de schema. Esfuerzo: **M**. Ficheros: `Dockerfile`, `prisma/migrations/` (nuevo), README.
11. **Probar a retirar `'unsafe-eval'` del CSP en producción** — Next App Router en build de producción no suele necesitarlo; verificar en deploy y endurecer si aguanta. Esfuerzo: **S**. Ficheros: `next.config.ts`.
12. **Subir cobertura de los 2-3 idiomas beta con más uso real** — Antes, mirar qué idiomas selecciona la gente (no hay analytics; bastaría un contador anónimo por código de idioma o preguntar en el Discord del clan). Esfuerzo: **L** si se traduce en serio. Ficheros: `src/i18n/translations.ts`.

## 4. Quick wins (menos de 1 hora)

- Quitar `maximumScale: 1` del viewport (`src/app/layout.tsx:92`) — desbloquea el zoom táctil (WCAG 1.4.4).
- Renombrar `"name"` a `"avalontracker"` en `package.json` y actualizar las 4 referencias `avalon-tracker` de cada README (líneas 120-121, 154, 222 tanto en `README.md` como en `README.en.md`; 8 en total).
- Cambiar el label `native` de `es` a **"Castellano"** en `src/i18n/languages.ts` (el selector convive con català/galego/euskara; el código ISO `es` no se toca).
- Arreglar `npm run seed`: o definir `seed` en `prisma.config.ts` apuntando a `scripts/seed.ts`, o cambiar el script a `tsx scripts/seed.ts`; corregir de paso el comentario que apunta a `prisma/seed.ts`.
- Corregir el README: la respuesta de `/api/health` ya no incluye `uptime`.
- Borrar `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`.
- Reordenar `calcTimeLeft` antes del `useState` en `src/components/routes/RouteTimer.tsx` (quita 1 error de lint).
- Corregir el comentario del soft-delete en `prisma/schema.prisma` (~línea 268): dice que el barrido hard-borra hops con `deletedAt` > **7 días**, pero el TTL real es de **2 días** (`ttlMs` en `routes/route.ts` y el propio comentario del `@@unique` más abajo). Doc-drift peligroso justo en la lógica más delicada.

## 5. Riesgos y zonas frágiles

- **`next-auth@5.0.0-beta.30`**: canal beta en el corazón del auth. Cualquier bump puede romper el flujo OAuth/JWT; actualizar solo leyendo release notes y probando el login en deploy.
- **`prisma db push --accept-data-loss` en cada arranque** (Dockerfile CMD): un cambio destructivo de schema se aplicaría a producción sin confirmación. Mitigación: mejora P3-10.
- **Estado in-memory por proceso**: rate limits (`src/lib/rate-limit.ts`, `src/middleware.ts`) y cache de roles (`src/lib/permissions.ts`, TTL 30 min) asumen instancia única. Escalar a 2+ réplicas en Coolify rompería ambos silenciosamente.
- **Dependencia dura de Vigil Bot**: es la autoridad de roles; si cae, la resolución degrada a cache (30 min) y los flujos 412/503 recién distinguidos (`9f4316e`). El banner global de salud (`70af03c`) lo cubre en UI, pero es el acoplamiento más sensible del sistema.
- **Datos del mundo refrescados a mano tras parches de Albion** (README, sección "Fuentes de datos"): un parche tipo "Radiant Wilds" puede desincronizar zonas/adyacencias y el pathfinding hasta que se regenere `src/data/world-meta.json`.
- **Divergencia público/privado del ingest**: con el subsistema en un repo de archivo, cada cambio en `main` (schema, permisos, libs) puede romper la rama privada sin que ningún test lo avise.
- **Barrido lazy con escrituras en el hot path de lectura**: además del churn, los `deleteMany` corren fuera de transacción respecto a la lectura posterior; en concurrencia alta entre miembros del mismo clan es terreno de carreras benignas hoy, menos benignas si se cambia la semántica del TTL.

## 6. Qué NO hacer

- **No reintroducir el rol super admin ni ninguna visibilidad cross-clan** (decisión de producto firme desde 2026-04-24; el README la vende como garantía de privacidad y es un diferenciador).
- **No montar CI de build/test en GitHub Actions** — no existe `.github/` y debe seguir así; builds y tests en local, deploy vía Coolify.
- **No volver a publicar el subsistema de ingest en este repo público** sin una decisión explícita: se retiró a propósito (`a29a1f6`) para que las rutas de la versión pública sean manuales.
- **No activar el proxy naranja de Cloudflare** para `avalontracker.app` ni para el Vigil Bot: DNS only (el proxy rompe el OAuth con redirect loops y las llamadas server-to-server con 403).
- **No meter secrets en el repo ni en docs**: siguen yendo como env vars en Coolify (`.env.example` solo con placeholders, como ahora).
- **No añadir el domicilio personal** al aviso legal/privacidad; la fórmula actual (email de contacto, Opción B) es la correcta hasta que exista forma jurídica.
- **No subir `next-auth` a una major/estable "de pasada"** dentro de un bump general de dependencias.
- **No mencionar herramientas de IA** en README, commits ni ningún artefacto público del proyecto.

## 7. Hoja de ruta sugerida

1. **Higiene inmediata (1 sesión):** P1-1 (retirar logger diagnóstico) + quick wins (viewport, naming, seed, README/health, SVGs, "Castellano", RouteTimer).
2. **Purga de código muerto (1 sesión):** P1-2 (borrar `server.ts` + deps socket/pino-http/express→dev) y de paso P2-8 (limpiar `public/`). Build local + deploy de verificación en Coolify.
3. **Dependencias (1 sesión corta):** P1-3 (prisma 7.8, vitest 3.2.6, next 16.2.x, minors) + `npm audit` limpio + `npm test` verde + login Discord probado en deploy.
4. **Decisión de ingest (asíncrona):** P1-4 — decidir (a) o (b) y dejar nota interna; si (a), planificar el deploy de la instancia propia desde el archivo privado.
5. **Calidad sostenida (1-2 sesiones):** P2-5 (lint a cero) y P2-6 (throttle del barrido).
6. **Refactor del barrido (1 sesión):** P2-7 (extraer `route-sweep.ts` + tests de la matriz de estados).
7. **Infra cuando toque:** P2-9 (imagen Docker podada) y P3-10 (migrations versionadas), idealmente juntas porque ambas tocan el `Dockerfile` y piden un deploy vigilado.
8. **Pulido opcional:** P3-11 (CSP sin `unsafe-eval`) y P3-12 (i18n de los idiomas beta con demanda real).
