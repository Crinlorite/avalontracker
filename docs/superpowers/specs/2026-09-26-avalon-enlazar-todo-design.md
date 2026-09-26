# Avalon Tracker — «enlazar todo»: web pública, mapas personales y app KMP

Fecha: 2026-09-26 · Estado: diseño aprobado por secciones en conversación; pendiente de revisión escrita · Autor: Crinlorite

Los planes de implementación se escriben **uno por fase** (§12); esta spec es la referencia común de todos.

## 1. Propósito y criterios de éxito

Avalon Tracker recibe tráfico de Google por «avalon map checker» y registra 35 altas al mes, pero en septiembre hubo **una** acción en total: el 85 % de los registrados no podía hacer nada porque crear un clan exigía ser admin de un Discord con Vigil Bot. La competencia deja empezar sin cuenta y comparte por enlaces.

Este diseño convierte Avalon en la herramienta de Caminos de Avalon más útil **con los mismos datos públicos que usan los demás**, enlazándolos entre sí (zona ↔ cofres ↔ botín ↔ precios ↔ mercado) y entre productos (web ↔ app ↔ Discord ↔ Royal Forge).

**Éxito** (base 26-sep-2026): personas que crean o editan algo al mes (hoy 1); páginas de `/zones` indexadas y visitas a `/zones` y `/map`; mapas compartidos por enlace; dispositivos vinculados. No se miden altas.

**Modelo:** gratis para siempre. Avalon es escaparate del ecosistema Crintech (Royal Forge, Vigil). Sin niveles de pago, sin límites pensados para cobrar, sin anuncios.

## 2. Decisiones cerradas (26-sep-2026)

| Tema | Decisión |
|---|---|
| Modelo | Gratis para siempre, escaparate del ecosistema |
| App ↔ cuenta | Offline primero; sincronización opcional con la cuenta web |
| Captura automática | **No hay** ninguna: todo se introduce a mano desde web o app |
| Compartir mapas personales | Enlaces de **ver** y de **editar**, revocables |
| Mapa vivo compartido por todos | No; nadie ve nada que no le hayan enlazado |
| Enfoque de sincronización | «Web cerebro, app espejo»: el servidor manda en conflictos |
| Papelera | **7 días** en web y app (la web tenía 2) |
| Valor de cofres | Categorías de botín ordenadas por peso; **sin porcentajes ni valor esperado** |
| Precios | AODP cacheados cada hora en Postgres; nunca por visita |
| Tiendas | Nada se publica sin que Crinlorite evalúe la build en TestFlight / prueba cerrada |
| Logos | Nuevos, en SVG, para Avalon Tracker (y Royal Forge, en su sesión); paso visual aparte |

## 3. Punto de partida (ya en vivo el 26-sep)

- `/zones`, `/zones/<zona>` (EN y `/es/`), `/exits`, portada nueva, cuenta de invitado, mapas personales (`Clan.kind = PERSONAL`), conversión de mapa personal a clan de Discord, 400 zonas del dump vivo (`scripts/extract-avalon-zones.ts`), tests adversariales sobre PGlite.
- App Flutter 1.1.0 (iOS publicada; Android en prueba cerrada): offline, sin cuenta, comparte por código v1 (`avalontracker://r/<código>` y `https://avalontracker.app/i/<código>`, hoy 404 en la web).

## 4. Arquitectura

```
 Google ──► web pública (Next.js, servidor securverso, Postgres)
                │  fichas de zona · buscador de salidas · /m/<token> · /i/<código>
                │  API v1: dispositivos · mapas/cambios · enlaces · zonas
                │
   ┌────────────┴─────────────┐
   │ app KMP (Android/iOS)    │  BD local SQLDelight · cola de cambios
   │ funciona sin cuenta      │  vinculada → mismo mapa que la web
   └──────────────────────────┘
 Datos: dump del juego (extractor) ─► JSON en web y app
        AODP (precios, cada hora)  ─► Postgres ─► fichas y API pública
 Discord/Vigil: sin cambios (clanes, roles, webhooks, auditoría)
```

**Fuente de verdad:** el servidor. La app guarda una copia local y una cola de cambios; sin vínculo es 100 % local.

## 5. Cuentas, dispositivos y enlaces compartidos

### 5.1 Cuentas
Las de hoy: invitado (cookie de sesión) y Discord. No se añade ningún tipo nuevo.

### 5.2 Vincular un dispositivo (token de dispositivo)
Tabla `DeviceToken { id, userId, name, tokenHash, createdAt, lastUsedAt, revokedAt }`. Un token identifica un dispositivo de un usuario y autentica **solo** `/api/v1/*` (`Authorization: Bearer`). Se lista y revoca desde Perfil (web) y Ajustes (app).

Flujos:
1. **Web → móvil (QR).** Perfil → «Vincular un dispositivo» → `POST /api/v1/devices/link` (sesión web) devuelve un código de un solo uso válido 60 s, mostrado como QR. La app lo escanea y llama a `POST /api/v1/devices/claim { code, deviceName }` → `{ token, userId, isGuest }` (el token se enseña una sola vez). Vale para invitados y para Discord.
2. **Móvil sin web.** «Sincronizar» → `POST /api/v1/guest { deviceName }` (sin auth, límite por IP) crea invitado + token en un paso.
3. **Discord desde la app.** La app abre en el navegador del sistema `/link/app` (que exige login con Discord). Tras el login, la página emite un código de un solo uso y redirige a `avalontracker://linked?code=…`; la app reclama el token como en (1). Si la app ya tenía un token de invitado, llama a `POST /api/v1/me/merge { guestToken }` con el token de Discord: se ejecuta la fusión ya existente (`mergeGuestInto`) y el token de invitado queda revocado. Exige que los dos tokens sean válidos.

### 5.3 Enlaces compartidos (solo mapas PERSONAL)
Tabla `MapShare { id, clanId, role: VIEWER|EDITOR, tokenHash, createdById, createdAt, revokedAt }`. URL: `https://avalontracker.app/m/<token>` con token de 128 bits (base64url, 22 caracteres); en BD solo el hash.

- Crear/listar/revocar: `POST|GET /api/v1/maps/{id}/shares`, `DELETE /api/v1/maps/{id}/shares/{shareId}` (ADMIN del mapa; también desde la UI web del mapa).
- **Ver:** `/m/<token>` (rol VIEWER) muestra el mapa en solo lectura **sin cuenta** (render de servidor, `noindex`). Es el modo lectura del grafo actual.
- **Editar:** `/m/<token>` (rol EDITOR) muestra vista previa y botón «Editar»; al pulsarlo se crea invitado si no hay sesión y se llama a `POST /api/v1/shares/{token}/join` → `ClanMember { appRole: EDITOR, roleSource: "share:<shareId>" }`. Desde la app, abrir el enlace hace lo mismo con el token de dispositivo (también para VIEWER, para que el mapa aparezca en la app).
- **Revocar** marca `revokedAt` y **borra las membresías** con `roleSource = "share:<id>"`. Los enlaces revocados responden 404.
- Los mapas `DISCORD` no admiten enlaces (403). Al **convertir** un mapa personal en clan de Discord se revocan todos sus enlaces y sus membresías (los roles pasan a Vigil).
- Límite de intentos: 20 tokens fallidos por IP y minuto → 429.

Reutiliza la rama «mapa personal» de `getUserRoleInClan` (creador = ADMIN; el resto, membresía explícita). No hay una segunda capa de permisos.

## 6. Sincronización

### 6.1 Identidad de filas
- **Ruta:** id generado por el cliente (UUID v4 en minúsculas). El servidor lo acepta al crear si cumple el formato y no existe. Las rutas creadas desde la web siguen con cuid.
- **Salto:** clave natural `(routeId, fromZone, toZone)` (única en BD). *Upsert* sobre esa clave; cambiar zonas = borrar + crear.
- **Zonas por nombre** en la API; el servidor resuelve a ids y rechaza nombres que no estén en su tabla (400 con el nombre).

### 6.2 Protocolo (por mapa)
- `GET /api/v1/maps` → mapas donde el usuario es miembro (`id, name, kind, myRole, updatedAt`).
- `POST /api/v1/maps { anchorZone? }` → mapa personal (mismo límite que la web: 3 por usuario).
- `GET /api/v1/maps/{id}/changes?since=<ISO del servidor>` → `{ routes: [...], hops: [...], serverTime }` con todo lo cambiado desde `since`, incluidos borrados (`deletedAt`) y desactivados. Sin `since` devuelve todo. Si hay más de 500 filas, la respuesta lleva `hasMore: true` y `next` (el `updatedAt` de la última fila entregada) para pedir el resto con `since=next`.
- `POST /api/v1/maps/{id}/changes { routes: [...], hops: [...] }` → aplica el lote y responde `{ applied: [...], rejected: [{ key, reason: "stale", server: {...} }], serverTime }`.
  - Ruta: `{ id, notes, status, disabledAt, deletedAt, baseUpdatedAt }`.
  - Salto: `{ routeId, fromZone, toZone, order, portalSize, expiresAt, status, statusNote, deletedAt, baseUpdatedAt }`. **Tamaño de portal, estándar del juego actual: 7 (azul) o 20 (amarillo).** La API acepta `portalSize ∈ {7, 20}` al crear o modificar; los valores heredados 2 (app Flutter) y 40 (web antigua) se conservan en las filas existentes y se muestran tal cual, pero no se ofrecen ni se aceptan en escritura (decisión de Crinlorite, 26-sep; fuentes: guía oficial y Albion Roads Mapper).
  - `baseUpdatedAt` = el `updatedAt` del servidor que el cliente vio por última vez (ausente en filas nuevas).
- **Regla de conflicto: el servidor manda.** Si `updatedAt` en servidor ≠ `baseUpdatedAt`, la fila se rechaza como `stale` y el cliente sustituye su copia por `server`. No se usa el reloj del cliente.
- Idempotente: reenviar un lote no duplica (creates por id/clave natural; updates comparan base).
- Permisos: lectura VIEWER, escritura EDITOR, vía `requireRole` con el usuario del token. Cada cambio deja auditoría como desde la web. Lotes de hasta 200 filas.

### 6.3 Cuándo sincroniza la app
Al abrir; tras cada cambio local (agrupando 2 s); al tirar para refrescar; en segundo plano (WorkManager en Android, BGAppRefresh en iOS; ~15 min, sin garantía). Tras cada bajada, reprograma los avisos locales. **Sin servicio push** en esta versión.

### 6.4 Caducidad, estados y papelera
- `EXPIRED` se deriva de `expiresAt` en ambos lados (la web ya lo hace al leer). Los estados manuales (`DISABLED`, `COLLAPSED`, `WATCHED`, nota) se sincronizan.
- Papelera = `deletedAt` en saltos (como hoy) y **también en rutas** (`Route.deletedAt`, nuevo) para que «borrar ruta» sea un hecho sincronizable. TTL **7 días** en una sola constante `TRASH_TTL_MS` compartida por `trash/route.ts`, `routes/[routeId]/route.ts` y el barrido de `routes/route.ts` (hoy 2 días en tres sitios). El barrido no elimina rutas caducadas antes de 7 días.

### 6.5 Migración desde la app Flutter
En el primer arranque la app KMP lee la BD drift (`avalon_tracker`, SQLite; ruta a confirmar en implementación) y `shared_preferences` (`webhook_url`, `display_name`, `language_code`), importa rutas, saltos (con `sortOrder`, estado, nota, `deletedAt`) y ajustes, y **no borra** la BD antigua.

## 7. Inteligencia de zona

Fuente: dump del juego (`ao-data/ao-bin-dumps`, commit fijado en `avalon-zones.source.json`) y AODP.

- **Ya en vivo:** tier, clase y familia («a qué lleva»), recursos con tier de nodo, cofres por calidad y tamaño, mazmorras, minimapa, zonas parecidas.
- **Bichos** (`mobcounts` de `world.json`): critters de recolección por recurso y tier, guardianes, osos y lobos. Se añaden al extractor y al JSON.
- **Qué puede salir de cada cofre:** `lootchests.json` (`AVALON_SMALL_SOLO_*`, `AVALON_ELITE_*`, estados estándar/poco común/raro/legendario por tier) → `loot.json` (`Lootlist` con `Item` y `LootListReference` y sus `@chance`). El extractor resuelve el árbol hasta **categorías** (equipo T4-T8, artefactos de Avalon, fragmentos, libros de fama, tesoros, fichas, plata) y las ordena por peso acumulado. **No se publican porcentajes ni valor esperado.**
- **Precios AODP:** tabla `MarketPrice { itemId, city, sellMin, sellMinDate, fetchedAt }`. Tarea horaria en `instrumentation.ts`: recursos `T4..T8` × `ORE, WOOD, FIBER, HIDE, ROCK` con encantamientos `.0–.3` en las ciudades royal y Caerleon, en peticiones por lotes. Si AODP falla, se conserva el último dato con su fecha. La ficha enseña «precio hoy» con fecha; nunca un precio sin fecha.
- **Dónde vender** (`/exits` y app): zona de salida → ciudad royal más cercana → precios de los recursos de la zona de Avalon de origen en esa ciudad → enlace al mercado de Royal Forge.
- **Enlaces a Royal Forge:** cada recurso/item → `https://royalforge.app/market/item/<id>`. Propuesta para la sesión de Royal Forge (fuera de este alcance): «zonas de Avalon donde se recolecta este recurso».
- **API pública:** `GET /api/v1/zones` (índice: nombre, tier, familia; ETag) y `GET /api/v1/zones/{nombre}` (ficha completa + precios + categorías + bichos). Solo lectura, caché 1 h, CORS abierto, límite por IP. La app la usa para lo «vivo»; Vigil podrá usarla para un `/zone` en Discord.
- **Lista de AODP:** cuando los precios estén en vivo, PR a `ao-data/albiondata-server-rails` con el mismo formato que el #100 (Royal Forge).

## 8. Enlaces profundos y páginas

- `/.well-known/apple-app-site-association` y `/.well-known/assetlinks.json` (huella SHA-256 del certificado de firma de Play) para `/m/*` y `/i/*`. Las fichas de zona **no** se interceptan.
- `/m/<token>`: §5.3.
- `/i/<código>`: decodifica el código v1 (JSON compacto → gzip → base64url), muestra la ruta con tiempos, y ofrece «Abrir en la app» y «Añadir a mi mapa» (crea invitado + mapa personal si hace falta). `noindex`.
- `/link/app`: página de login para vincular la app (§5.2, flujo 3).
- `robots`: `/m/`, `/i/`, `/link/` fuera del sitemap y con `noindex`.
- Esquema `avalontracker://` se mantiene (`r/<código>` y `linked?code=`).

## 9. App KMP

### 9.1 Repo y estructura
`avalontracker-kmp` (privado, Crinlorite): `shared` (Kotlin Multiplatform), `androidApp` (Jetpack Compose), `iosApp` (SwiftUI; `.xcodeproj` generado con xcodegen, no versionado). Identificadores y firma **iguales** a la app actual (`com.crintechstudios.avalontracker`; Play App Signing con la clave de subida de Crintech; equipo Apple 2JE586S3VM) para actualizar encima. Librerías: kotlinx-serialization, kotlinx-datetime, coroutines, Ktor client, SQLDelight, multiplatform-settings.

### 9.2 `shared`
Modelos y estados · BD SQLDelight (rutas, saltos, mapas, ajustes, cola de cambios) · repositorios · motor de sincronización (§6) · catálogo de zonas y grafo del mundo (buscador de salidas) · codec de compartir **v1 idéntico** · lógica de avisos (1 h antes, 15 min antes, al caducar; ids estables por ruta/salto) · cliente HTTP (sincronización, zonas, precios) · webhook de Discord · **i18n:** los 23 ARB actuales pasan a una única fuente en `shared/i18n/*.json`; un script genera `strings.xml` (Android) y `Localizable.strings` (iOS) y una tabla Kotlin para textos de lógica. Ningún idioma se pierde.

### 9.3 Plataformas
- **Android:** Compose + Material You (color dinámico), widget Glance «próximo portal», avisos con alarmas exactas (`SCHEDULE_EXACT_ALARM`, ya declarado), App Links, escáner QR (CameraX + ML Kit), hoja de compartir.
- **iOS:** SwiftUI con el aspecto nativo de la 1.1, **WidgetKit** (nuevo; App Group `group.com.crintechstudios.avalontracker`), `UNUserNotificationCenter`, Universal Links, escáner QR (AVFoundation), hoja de compartir.
- Tokens de diseño compartidos con Royal Forge (`design/tokens.json` de su F3), respetando lo nativo en iOS.

### 9.4 Lista de control de paridad (la firma Crinlorite con capturas de ambas plataformas)

| Función (app Flutter 1.1) | KMP |
|---|---|
| Lista de rutas con filtro por estado y cuenta atrás en vivo | ✓ |
| Nueva ruta: hasta 12 saltos encadenados, autocompletado, tamaño de portal (la app ofrecía 2/7; pasa al estándar **7/20**), tiempo restante | ✓ |
| Estados de salto: activo, caducado, desactivado, colapsado, vigilado; nota | ✓ |
| Ampliar tiempo, borrar salto, borrar ruta, notas de ruta | ✓ |
| Avisos locales 1 h / 15 min / caducidad | ✓ |
| Envío a Discord por webhook (con nombre visible) | ✓ |
| Compartir por enlace, QR y código; importar escaneando o pegando | ✓ (mismo formato v1) |
| Widget «próximo portal» | Android ✓ · **iOS nuevo** ✓ |
| Papelera con restauración | ✓ (7 días) |
| 23 idiomas con selector propio; tema claro/oscuro; Material You | ✓ |
| Ajustes: webhook, nombre, idioma | ✓ + cuenta/vínculo, dispositivos |
| **Nuevo:** varios mapas, enlaces compartidos, vinculación y sincronización | ✓ |
| **Nuevo:** zonas (buscador + ficha con minimapa, cofres, bichos, precios con red) y salidas | ✓ |

## 10. Seguridad (🔴 con tests adversariales)

- Enlaces: token 128 bits, hash en BD, 429 por IP; revocar borra membresías `share:<id>`; EDITOR nunca escala a ADMIN; mapas DISCORD no se comparten por enlace; enlace revocado → 404.
- Tokens de dispositivo: hash en BD; uno por dispositivo; revocables; solo `/api/v1`; límite por token (600/h) y por IP en `guest`/`claim`.
- Sincronización: solo mapas donde eres miembro; `routeId` validado contra el mapa (no se cuela un salto en otro mapa); formato estricto de ids; nombres de zona validados; lotes ≤ 200.
- Fusión invitado → Discord: exige dos tokens válidos; nunca absorbe una cuenta real ni otro invitado (ya probado en la web).
- API pública de zonas: solo lectura, caché, CORS, límite por IP.
- Cabeceras de seguridad y CSP como hoy.

## 11. Pruebas

- **Web (🔴 sobre PGlite):** enlaces (crear, unirse, revocar corta acceso, adivinanza limitada, DISCORD prohibido), dispositivos (reclamar, revocar, token ajeno), sincronización (miembro/no miembro, `stale`, idempotencia, salto en ruta ajena), fusión desde la app; **mutación de guardas** (romper una defensa debe hacer fallar un test). 🟡 TDD: caché AODP (fallo de red, fecha), resolución de categorías de botín, extractor (verificación cruzada). 🟢 humo Playwright de páginas y flujos.
- **App:** `commonTest` (motor de sync con servidor simulado, codec con fixtures generados por la app Flutter, migración con una BD real de la app antigua, programación de avisos); humo instrumentado en emulador y simulador; capturas automáticas para tiendas.
- **Paridad:** §9.4 con captura por función y plataforma.

## 12. Entrega por fases (cada una sale sola; OK de Crinlorite para cada despliegue y cada tienda)

1. **Web:** `Route.deletedAt` + `TRASH_TTL_MS` 7 días; `DeviceToken`, `MapShare`; API v1 (dispositivos, mapas, cambios, enlaces); `/m`, `/i`, `/link/app`; AASA y assetlinks; UI de compartir y de dispositivos. Arregla ya los enlaces rotos de la app actual.
2. **Web:** bichos, categorías de botín, precios AODP, «dónde vender», API pública de zonas; PR a la lista de AODP.
3. **App núcleo + Android:** `shared` con paridad, sincronización, mapas, zonas, salidas; prueba cerrada de Play (12 testers cuando toque).
4. **App iOS:** SwiftUI + WidgetKit → TestFlight → evaluación de Crinlorite.
5. **Tiendas:** fichas EN/ES (ya escritas en `avalontracker-app/metadata/ios/`), capturas nuevas, publicación con OK; el repo Flutter queda archivado.
- **Logo SVG:** paso visual aparte antes de la fase 5 (iconos, OG, web).

## 13. Fuera de alcance

Captura automática de cualquier clase; mapa vivo compartido por todos; servicio push; niveles de pago; cambios en Vigil Bot (el `/zone` de Discord es una propuesta para su sesión); cambios en Royal Forge (propuesta para su sesión); regenerar `world-meta.json` desde el dump vivo (perdería 122 correcciones a mano).

## 14. Pendientes de verificación (antes de publicar textos o cerrar la implementación)

1. Significado exacto de las clases `TUNNEL_ROYAL`, `TUNNEL_BLACK_*`, `TUNNEL_HIDEOUT*`, `TUNNEL_DEEP*` contra la wiki; hasta entonces la ficha enseña el código crudo junto a la etiqueta.
2. Ruta de la BD drift de la app Flutter en iOS y Android (para la migración).
3. Orientación del minimapa respecto al del juego (hoy «esquemático»).
4. Política de uso de AODP (cabecera `User-Agent` identificativa y frecuencia aceptada).
5. ~~Tamaños de portal~~ Resuelto el 26-sep: estándar 7/20 (§6.2); la fase 1 quita el 40 del selector web y de los esquemas de escritura.
