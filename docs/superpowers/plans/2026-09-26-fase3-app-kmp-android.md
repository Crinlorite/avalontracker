# Fase 3 — App KMP: núcleo compartido + Android — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la app Flutter 1.2 por una app Kotlin Multiplatform con paridad total (§9.4 de la spec), sincronizada con la web (mapas personales, enlaces, dispositivos), con zonas y salidas dentro de la app, y dejar Android listo para la prueba cerrada de Play. iOS es la fase 4 y **reutiliza toda la UI de esta fase**.

**Architecture:** tres módulos como en `royalforge-kmp` (mismo autor, misma máquina, misma toolchain probada): `shared` (lógica pura: modelos, códec v1, avisos, Discord, catálogo de zonas y salidas, cliente HTTP, motor de sincronización; objetivos jvm + linuxX64 + ios), `composeApp` (UI Compose Multiplatform + Room KMP + DataStore + repositorios + ViewModels; Android library + framework iOS + `desktop` solo para tests y capturas), `androidApp` (Activity, enlaces profundos, alarmas de avisos, WorkManager, widget Glance, escáner QR, migración desde la BD de Flutter). La app es **offline primero**: las rutas viven en Room; si hay token de dispositivo, cada mapa se sincroniza con «el servidor manda» (§6).

**🔁 Cambio de tecnología respecto a la spec §9.1 (a validar por Crinlorite en la revisión del plan):** la spec decía SQLDelight + multiplatform-settings + iOS en SwiftUI. Este plan usa **Room KMP + `sqlite-bundled`, DataStore y Compose Multiplatform también para iOS** (con envoltorio Swift y widgets SwiftUI), porque es exactamente lo que ya compila y se publica desde lynx y el M4 en `royalforge-kmp` (Kotlin 2.4.20, AGP 9.4.1, Compose MP 1.12.1): una sola UI para las dos plataformas es paridad por construcción, y no hay que aprender dos pilas a la vez. Lo que NO cambia: identificadores, firma, formato v1 del códec, protocolo de sincronización, 23 idiomas, widget, avisos.

**Tech Stack:** Kotlin 2.4.20, AGP 9.4.1, Compose Multiplatform 1.12.1, Room 2.8.5 (KSP 2.3.12) + androidx.sqlite bundled 2.7.1, DataStore 1.2.1, Ktor 3.6.0 (OkHttp/Darwin), kotlinx-serialization 1.11.0, kotlinx-datetime 0.7.1, coroutines 1.11.0, WorkManager 2.12.0, Glance 1.2.0, CameraX 1.5 + ML Kit barcode 17.3, `qrose` 1.0.1 (QR en Compose, multiplataforma). JDK 17 (toolchain), SDK Android en `/opt/android-sdk` (API 36/37), AVD `royalforge-api36` en lynx para humo.

**Spec:** `docs/superpowers/specs/2026-09-26-avalon-enlazar-todo-design.md` — §5.2, §6, §9, §10, §11, §12.3, §14.2. Repo de referencia: `/root/projects/royalforge-kmp` (copiar convenciones, no código de negocio). App a sustituir: `/root/projects/avalontracker-app` (Flutter, `lib/`).

## Global Constraints

- Repo nuevo **privado** `Crinlorite/avalontracker-kmp` en `/root/projects/avalontracker-kmp`. Commits como `Crinlorite <xlorit@hotmail.es>`, sin atribución. **Nada se sube a Play sin OK explícito** (Tarea 15).
- `applicationId`/namespace **`com.crintechstudios.avalontracker`**, `versionCode 12`, `versionName "2.0.0"` (la Flutter es 1.2.0+11). Firma: `keystore.properties` (gitignored) → `/root/empyre-release/crintechstudios.jks`, alias `avalontracker`, contraseña estándar de la casa. **Nombres de componentes que no cambian**: `.MainActivity`, receptor del widget `.AvalonRouteWidgetProvider`, canal de notificaciones `avalon_route_expiry`, esquema `avalontracker://` (`r/<código>`, `linked?code=`).
- **Formato v1 del códec idéntico** al de la web (`src/lib/route-codec.ts`) y al de Flutter (`lib/core/share/route_codec.dart`): JSON compacto `{v:1, n?, h:[{f,t,s,e,st?,sn?}]}` → gzip → base64url sin `=`; tope 64 KiB descomprimido.
- **Sincronización §6**: ids de ruta UUID v4 en minúsculas generados en el cliente; salto = `(routeId, fromZone, toZone)`; `baseUpdatedAt`; `stale` → el cliente adopta la fila del servidor; lotes ≤ 200; `portalSize` 7|20 al crear (2 y 40 heredados solo lectura); paginación con `hasMore`/`next`.
- **Avisos**: 1 h antes, 15 min antes y al caducar, solo para saltos ACTIVE de rutas ACTIVE fuera de la papelera; ids estables por (ruta, salto, tipo). Android: `AlarmManager.setAndAllowWhileIdle` (inexacto, como la Flutter: sin `SCHEDULE_EXACT_ALARM`) + reprogramación al arrancar.
- **Papelera 7 días** en rutas y saltos; barrido perezoso al abrir.
- **23 idiomas** de `avalontracker-app/lib/l10n/app_*.arb` (129 claves) sin perder ninguno; los textos nuevos de esta fase van a los 23 (EN/ES escritos a mano, el resto marcados beta). `va` no existe en Flutter (no lo soportaba `gen_l10n`): se añade igual que en `royalforge-kmp` si su script lo contempla; si no, queda para la fase 5.
- Sin captura automática de nada ([[feedback_loot_vigil_privado]]); sin servicio push; sin niveles de pago.
- `commonMain` solo APIs multiplataforma (`scripts/check-common.sh`, copiado de Royal Forge). iOS no se compila en esta fase, pero **nada de esta fase puede impedirlo** (sin `java.*` en común, `@Throws` en lo que Swift llamará, tablas Room con sufijo `Entity`).
- Tests: 🔴 motor de sincronización y códec (vectores generados por la web); 🟡 TDD en avisos, Discord, salidas, migración; 🟢 humo en emulador + capturas de escritorio revisadas una a una.
- RAM de lynx (23 GB): nunca emulador + `gradle build` de release a la vez; `org.gradle.jvmargs=-Xmx3g`.

## Review Focus

1. **Conflicto real de sincronización** (dos dispositivos editan el mismo salto): el perdedor debe quedarse con la fila del servidor sin duplicar ni perder la nota del ganador. Test en la Tarea 7 (`stale` → adopción) y en la 8 (Room aplica `applyServerHop` sobre la clave natural).
2. **Sin red** (avión, o `avalontracker.app` caído): crear/editar/borrar rutas sigue funcionando y la cola de cambios se vacía en la siguiente sincronización sin reenviar dos veces. Test en la Tarea 7 (fallo de red a mitad de lote → nada marcado limpio) y humo en la 14 (modo avión del emulador).
3. **Usuario que actualiza desde la Flutter 1.2 con rutas y ajustes**: al abrir la 2.0 ve sus rutas, papelera, webhook y nombre; la BD antigua no se toca. Test en la Tarea 13 con una BD drift real de fixture.
4. **Código v1 compartido entre las tres implementaciones**: un código creado en la web o en la app Flutter se importa igual, y uno creado en KMP lo abre la web. Tests en la Tarea 3 (vectores de la web) y cruce en la Tarea 14 (Node decodifica lo que Kotlin codificó).
5. **Reloj del dispositivo adelantado o atrasado**: `EXPIRED` se deriva de `expiresAt` con el reloj local (como Flutter y la web), pero la sincronización **nunca** usa el reloj del cliente para decidir conflictos (`baseUpdatedAt` es del servidor). Test en la Tarea 7 (cliente con reloj +2 h no provoca `stale`).

## Estructura de ficheros

```
avalontracker-kmp/
  gradle/libs.versions.toml · settings.gradle.kts · build.gradle.kts · gradle.properties · gradlew
  keystore.properties (gitignored) · README.md · scripts/{check-common.sh,sync-data.sh,quality_gate.sh,i18n/arb_to_compose.py,emulator-smoke.sh}
  shared/                                   # lógica pura (jvm, linuxX64, iosArm64, iosSimulatorArm64)
    src/commonMain/kotlin/com/crintechstudios/avalontracker/shared/
      model/{Statuses.kt, Route.kt, RouteWithHops.kt, Ids.kt, PortalSize.kt}
      codec/{DeflateRaw.kt, Gzip.kt, RouteCodec.kt}
      reminders/Reminders.kt · discord/DiscordEmbed.kt · time/Expiry.kt
      zones/{ZoneCatalog.kt, ZoneSuggest.kt, WorldGraph.kt, Assets.kt}
      net/{AvalonApi.kt, Dto.kt, ApiError.kt}
      sync/{SyncStore.kt, SyncEngine.kt, SyncModels.kt}
      i18n/LogicStrings.kt (generado)
    src/{jvmMain,nativeMain}/…/codec/DeflateRaw.{jvm,native}.kt · src/{jvmMain,nativeMain}/…/zones/Assets.*.kt
    src/commonTest/kotlin/… (tests) · src/commonTest/fixtures/{route-codes.json, sync/*.json, exits.json}
    data/{avalon-zones.json, chest-loot.json, world-meta.json, avalon-zone-names.json}  # scripts/sync-data.sh desde el repo web
  composeApp/                               # UI + datos (android library, ios framework, desktop para tests)
    src/commonMain/kotlin/com/crintechstudios/avalontracker/app/
      App.kt · di/{AppGraph.kt, ViewModels.kt} · platform/Platform.kt · i18n/Languages.kt
      data/db/{AppDatabase.kt, Entities.kt, Daos.kt} · data/{Settings.kt, RouteRepository.kt, MapRepository.kt, SyncCoordinator.kt, RoomSyncStore.kt}
      navigation/AppNavigation.kt · theme/Theme.kt
      ui/routes/{RoutesScreen.kt, RouteCard.kt, RouteTimer.kt, RoutesViewModel.kt}
      ui/create/{CreateRouteScreen.kt, ZoneAutocomplete.kt, CreateRouteViewModel.kt}
      ui/trash/TrashScreen.kt · ui/settings/{SettingsScreen.kt, AccountSection.kt, DevicesSheet.kt, LanguagePicker.kt}
      ui/share/{ShareRouteSheet.kt, ImportRouteScreen.kt}
      ui/maps/{MapsScreen.kt, ShareLinksSheet.kt} · ui/zones/{ZonesScreen.kt, ZoneDetailScreen.kt, ZoneMiniMap.kt, ZonePrices.kt} · ui/exits/ExitsScreen.kt
    src/commonMain/composeResources/values[-xx]/strings.xml (generado) · drawable/ (banderas, icono)
    src/androidMain/kotlin/…/{AndroidPlatform.kt, DatabaseBuilder.android.kt, AppLocale.android.kt}
    src/desktopMain/… (Platform de escritorio para capturas) · src/desktopTest/… (Room, repositorios, migración Flutter, Screenshots.kt)
  androidApp/
    src/main/kotlin/com/crintechstudios/avalontracker/{AvalonApp.kt, MainActivity.kt, ScanActivity.kt, AvalonRouteWidgetProvider.kt, util/{Reminders.kt, BootReceiver.kt, SyncWorker.kt, FlutterMigration.kt}}
    src/main/{AndroidManifest.xml, res/…}
  iosApp/ (vacío en esta fase; xcodegen en la fase 4)
```

---

### Task 1: Esqueleto del repo (tres módulos, versiones, firma, GitHub)

**Files:** todo lo de la raíz + `shared/build.gradle.kts`, `composeApp/build.gradle.kts`, `androidApp/build.gradle.kts`, `shared/src/commonTest/kotlin/…/SmokeTest.kt`, `README.md`, `.gitignore`, `scripts/check-common.sh`.

**Interfaces:** Produces: módulos `:shared`, `:composeApp`, `:androidApp`; tareas `./gradlew :shared:jvmTest :shared:linuxX64Test`, `:composeApp:desktopTest`, `:androidApp:assembleDebug`.

- [ ] **Step 1: Copiar la base de Royal Forge y renombrar**

```bash
mkdir -p /root/projects/avalontracker-kmp && cd /root/projects/avalontracker-kmp && git init -q
R=/root/projects/royalforge-kmp
cp -r $R/gradle $R/gradlew $R/gradlew.bat $R/gradle.properties . && cp $R/scripts/check-common.sh scripts/ 2>/dev/null || { mkdir -p scripts && cp $R/scripts/check-common.sh scripts/; }
printf 'sdk.dir=/opt/android-sdk\n' > local.properties
printf '/.gradle\n/build\n**/build/\nlocal.properties\nkeystore.properties\n.kotlin/\n*.iml\n.idea/\niosApp/*.xcodeproj\n' > .gitignore
```

`gradle/libs.versions.toml`: el de Royal Forge **más** `camerax = "1.5.1"`, `mlkitBarcode = "17.3.0"`, `qrose = "1.0.1"`, `coreKtx = "1.16.0"` y sus librerías (`androidx-camera-core/camera2/lifecycle/view`, `mlkit-barcode-scanning`, `qrose`), **menos** `coil` y `room-paging` si no se usan. `settings.gradle.kts` igual que Royal Forge con `rootProject.name = "AvalonTracker"`.

`shared/build.gradle.kts` = el de Royal Forge sin las properties `rf.*` (targets `jvm()`, `linuxX64()`, `iosArm64()`, `iosSimulatorArm64()`; commonMain: serialization, coroutines, datetime, ktor core + content-negotiation + kotlinx-json; commonTest: kotlin-test, coroutines-test, ktor mock; jvmTest: ktor okhttp; iosMain: ktor darwin). Añade a `commonMain` el directorio de datos como recursos de test: `sourceSets.commonTest.resources.srcDir("data")` **y** en `jvmTest` `environment("AT_DATA_DIR", projectDir.resolve("data").absolutePath)` (los tests nativos leen por `SIMCTL_CHILD_`/env igual que Royal Forge).

`composeApp/build.gradle.kts` = el de Royal Forge con `namespace = "com.crintechstudios.avalontracker.app"`, `baseName = "ComposeApp"`, `packageOfResClass = "com.crintechstudios.avalontracker.app.resources"`, dependencias comunes: `:shared`, compose (runtime, foundation, material3, materialIconsExtended, ui, components.resources), jb lifecycle viewmodel/runtime, jb navigation, room runtime + sqlite bundled, datastore preferences core, serialization, `qrose`; androidMain: ktor okhttp, coroutines android, activity compose; desktopMain: compose desktop currentOs + ktor okhttp; desktopTest: kotlin-test, coroutines-test, compose ui-test-junit4, ktor mock. `room { schemaDirectory("$projectDir/schemas") }` y KSP para android/desktop/ios.

`androidApp/build.gradle.kts` = el de Royal Forge con namespace/applicationId `com.crintechstudios.avalontracker`, `compileSdk 37`, `targetSdk 36`, `minSdk 26`, `versionCode 12`, `versionName "2.0.0"`, firma por `keystore.properties`; dependencias: `:composeApp`, activity-compose, work, glance + glance-material3, core-splashscreen, camerax (core, camera2, lifecycle, view), mlkit barcode, core-ktx.

`keystore.properties` (no va a git):
```
storeFile=/root/empyre-release/crintechstudios.jks
storePassword=<contraseña estándar de la casa, ver memoria reference_crintech_android_upload_key>
keyAlias=avalontracker
keyPassword=<la misma>
```

- [ ] **Step 2: Test de humo que falla**

```kotlin
// shared/src/commonTest/kotlin/com/crintechstudios/avalontracker/shared/SmokeTest.kt
package com.crintechstudios.avalontracker.shared
import kotlin.test.Test
import kotlin.test.assertEquals
class SmokeTest { @Test fun elModuloCompila() { assertEquals(4, 2 + 2) } }
```

Run: `./gradlew :shared:jvmTest --offline 2>&1 | tail -3` — Expected: falla (aún sin `build.gradle.kts` válidos) o «BUILD SUCCESSFUL» cuando el Paso 1 esté completo. Si el `--offline` falla por dependencias nuevas (camerax, mlkit, qrose), quitar `--offline` una vez.

- [ ] **Step 3: Verificar y crear el repo**

Run: `./gradlew :shared:jvmTest :shared:linuxX64Test :composeApp:desktopTest :androidApp:assembleDebug 2>&1 | grep -E "BUILD|FAILED|error:" | head` — Expected: `BUILD SUCCESSFUL` (composeApp puede tener un `App.kt` mínimo con un `Text("Avalon Tracker")`; androidApp una `MainActivity` que lo pinta).

```bash
git add -A && git -c user.name=Crinlorite -c user.email=xlorit@hotmail.es commit -q -m "esqueleto KMP: shared, composeApp y androidApp con la toolchain de Royal Forge; firma con la clave de subida de Avalon Tracker"
gh repo create Crinlorite/avalontracker-kmp --private --source=. --remote=origin --push
```

### Task 2: Modelos de dominio (`shared/model`)

**Files:** `shared/src/commonMain/kotlin/…/model/{Statuses.kt, Route.kt, RouteWithHops.kt, Ids.kt, PortalSize.kt}`; test `shared/src/commonTest/…/model/RouteWithHopsTest.kt`, `IdsTest.kt`.

**Interfaces (Produces):**
```kotlin
enum class RouteStatus(val wire: String) { ACTIVE("ACTIVE"), EXPIRED("EXPIRED"), DISABLED("DISABLED"); companion object { fun fromWire(s: String) = entries.firstOrNull { it.wire == s } ?: ACTIVE } }
enum class HopStatus(val wire: String, val code: String) { ACTIVE("ACTIVE","A"), EXPIRED("EXPIRED","E"), COLLAPSED("COLLAPSED","C"), WATCHED("WATCHED","W"); companion object { fun fromWire(s: String): HopStatus; fun fromCode(c: String): HopStatus } }
data class Route(val id: String, val createdAt: Instant, val status: RouteStatus = ACTIVE, val disabledAt: Instant? = null, val notes: String? = null, val deletedAt: Instant? = null)
data class Hop(val order: Int, val fromZone: String, val toZone: String, val portalSize: Int, val expiresAt: Instant, val status: HopStatus = ACTIVE, val statusNote: String? = null, val deletedAt: Instant? = null)
data class RouteWithHops(val route: Route, val hops: List<Hop>) { val sortedHops; val liveHops /*sin deletedAt*/; val routeLabel: String /* "A → B → C" */; val shortLabel: String /* "A → … → C" */; val isInTrash: Boolean; fun earliestActiveExpiry(): Instant?; fun latestExpiry(): Instant?; fun isFullyExpired(now: Instant): Boolean; fun effectiveStatus(now: Instant): RouteStatus /* DISABLED si disabledAt; EXPIRED si todos los saltos vivos caducados; si no, route.status */ }
object Ids { fun newRouteId(): String /* UUID v4 minúsculas, kotlin.uuid.Uuid.random() */; val ROUTE_ID = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") }
object PortalSize { val SELECTABLE = listOf(7, 20); val LEGACY = setOf(2, 40); fun isValid(n: Int) = n in SELECTABLE || n in LEGACY }
```

- [ ] **Step 1: Tests que fallan** — `RouteWithHopsTest`: etiquetas con 1 y 3 saltos (usa `→` con espacios), `shortLabel` con 1/2/3 saltos, `earliestActiveExpiry` ignora saltos no ACTIVE y borrados, `isFullyExpired` con `now` fijo, `effectiveStatus` (disabled gana; todos caducados → EXPIRED; salto WATCHED caducado no cuenta como vivo… replica `isFullyExpired` de Flutter: **todos** los saltos vivos con `expiresAt <= now`). `IdsTest`: 100 ids distintos, todos cumplen `ROUTE_ID`, en minúsculas.
- [ ] **Step 2: Implementación mínima** y `./gradlew :shared:jvmTest --tests '*model*'` — Expected: PASS.
- [ ] **Step 3: Commit** — `modelo: rutas, saltos, estados y utilidades de etiqueta/caducidad (paridad con la app Flutter)`.

### Task 3: Códec v1 (gzip + base64url) con vectores de la web

**Files:** `shared/src/commonMain/…/codec/{DeflateRaw.kt, Gzip.kt, RouteCodec.kt}`, `shared/src/jvmMain/…/codec/DeflateRaw.jvm.kt`, `shared/src/nativeMain/…/codec/DeflateRaw.native.kt` (los tres copiados de `royalforge-kmp/shared/src/*/codec/`, paquete cambiado), `shared/src/commonTest/fixtures/route-codes.json`, tests `GzipTest.kt`, `RouteCodecTest.kt`; en el repo **web**: `scripts/export-route-code-fixtures.ts`.

**Interfaces (Produces):**
```kotlin
object Gzip { fun compress(data: ByteArray): ByteArray /* cabecera 1f 8b 08 00 + MTIME 0 + XFL 0 + OS 255, deflateRaw, CRC32 LE, ISIZE LE */; fun decompress(data: ByteArray, maxOutput: Int = 65_536): ByteArray? /* null si cabecera/CRC/tamaño inválidos; salta FEXTRA/FNAME/FCOMMENT/FHCRC */ }
data class SharedHop(val fromZone: String, val toZone: String, val portalSize: Int, val expiresAt: Instant, val status: HopStatus = ACTIVE, val statusNote: String? = null)
data class SharedRoute(val notes: String?, val hops: List<SharedHop>)
sealed interface DecodeResult { data class Ok(val route: SharedRoute): DecodeResult; object Invalid: DecodeResult; object UnsupportedVersion: DecodeResult; object TooBig: DecodeResult }
object RouteCodec { const val SCHEME = "avalontracker"; const val WEB_IMPORT_BASE = "https://avalontracker.app/i"; fun encode(route: SharedRoute): String; fun decode(raw: String): DecodeResult; fun extractCode(text: String): String /* acepta código, avalontracker://r/<c>, https://avalontracker.app/i/<c>, espacios */; fun shareUrl(code: String) = "$WEB_IMPORT_BASE/$code"; fun deepLink(code: String) = "$SCHEME://r/$code" }
```
Reglas exactas (de `src/lib/route-codec.ts` de la web, léelo antes): `v` debe ser 1 (otro → UnsupportedVersion); `h` no vacío, cada salto con `f`,`t` cadenas no vacías, `s` entero, `e` entero (ms epoch UTC), `st` opcional ∈ {A,E,C,W}, `sn` opcional; `n` opcional; JSON no válido / base64 no válido / gzip corrupto → Invalid; descomprimido > 64 KiB → TooBig. Al codificar: `st` solo si ≠ ACTIVE, `sn` solo si no está en blanco, `n` solo si no está en blanco; base64url sin `=`.

- [ ] **Step 1: Vectores desde la web** — en `/root/projects/avalon-tracker` crea `scripts/export-route-code-fixtures.ts` que use `encodeRouteCode`/`decodeRouteCode` de `src/lib/route-codec.ts` para escribir `route-codes.json`: `[{ name, code, expected: { notes, hops: [{fromZone,toZone,portalSize,expiresAtMs,status,statusNote}] } }]` con 4 casos (1 salto ACTIVE; 3 saltos con WATCHED+nota y notas de ruta; caracteres no ASCII «Ñoño → Ærø»; portal heredado 40) **más** 3 códigos inválidos (`{v:2}`, JSON no válido, bomba de 5 MB de espacios → `TooBig`) con `expectedError`. Cópialo a `shared/src/commonTest/fixtures/route-codes.json`. Run: `npx tsx scripts/export-route-code-fixtures.ts && cp …` — Expected: fichero con 7 entradas.
- [ ] **Step 2: Tests que fallan** — `GzipTest`: ida y vuelta de 0 bytes, 10 bytes y 100 KiB (con `maxOutput` 200 KiB), CRC alterado → null, tope superado → null. `RouteCodecTest`: cada vector decodifica a `expected` (comparar `expiresAt.toEpochMilliseconds()`), los inválidos dan su error, ida y vuelta de un `SharedRoute` propio, `extractCode` con las tres formas.
- [ ] **Step 3: Implementación** (CRC32 con tabla en Kotlin puro en `Gzip.kt`; `RouteCodec` con `kotlinx.serialization.json.Json { ignoreUnknownKeys = true }` y construcción manual del `JsonObject` para el orden `v, n, h`). Run: `./gradlew :shared:jvmTest :shared:linuxX64Test --tests '*codec*'` — Expected: PASS en ambos (el nativo prueba `DeflateRaw.native.kt` con zlib de Linux).
- [ ] **Step 4: Commit** (repo KMP: `códec v1 de rutas compartidas: gzip sobre deflate crudo, base64url, vectores de la web`; repo web: `scripts: exportador de vectores del códec v1 para la app KMP`).

### Task 4: Avisos, embed de Discord y caducidad (`shared`)

**Files:** `shared/src/commonMain/…/reminders/Reminders.kt`, `discord/DiscordEmbed.kt`, `discord/DiscordWebhook.kt`, `time/Expiry.kt`; tests `RemindersTest.kt`, `DiscordEmbedTest.kt`, `DiscordWebhookTest.kt` (Ktor `MockEngine`).

**Interfaces (Produces):**
```kotlin
enum class ReminderKind { ONE_HOUR_BEFORE, FIFTEEN_MIN_BEFORE, AT_EXPIRY }
data class ReminderTexts(val routeClosedTitle: String, val doorExpiredBody: (String) -> String, val lessThan1HourTitle: String, val expiresIn1HourBody: (String) -> String, val fifteenMinLeftTitle: String, val expiresIn15MinBody: (String) -> String)
data class Reminder(val id: Int, val kind: ReminderKind, val routeId: String, val hopOrder: Int, val fireAt: Instant, val title: String, val body: String)
object Reminders { fun idFor(routeId: String, hopOrder: Int, kind: ReminderKind): Int /* estable, positivo: (routeId.hashCode() * 31 + hopOrder) * 3 + kind.ordinal, and 0x7fffffff */; fun forRoute(route: RouteWithHops, now: Instant, texts: ReminderTexts): List<Reminder> /* solo futuros; ruta ACTIVE y no en papelera; saltos ACTIVE no borrados */ }
object Expiry { fun deriveHopStatus(hop: Hop, now: Instant): HopStatus /* ACTIVE y expiresAt <= now → EXPIRED; el resto igual */; fun deriveRouteStatus(r: RouteWithHops, now: Instant): RouteStatus }
data class DiscordTexts(val doorField: (Int, String, String) -> String, val portalExpires: (Int, Long) -> String /* (horas, epochSeconds) → "…<t:1234:R>" */, val footer: (Int) -> String, val recordedBy: String)
object DiscordEmbed { fun build(route: RouteWithHops, displayName: String, texts: DiscordTexts, now: Instant): JsonObject /* {"embeds":[{title:"🗺️ "+routeLabel, color (0x22c55e activo, 0xef4444 disabled, 0x6b7280 expired), fields[ {name: doorField(i+1,from,to), value: portalExpires(size, epochSeconds), inline:false}…, {name: recordedBy, value: displayName, inline:true} si displayName no en blanco ], footer:{text: footer(n)}, timestamp: createdAt ISO}]} */ }
sealed interface SendResult { object Success: SendResult; data class HttpError(val status: Int, val body: String): SendResult; data class NetworkError(val message: String): SendResult }
class DiscordWebhook(private val client: HttpClient) { @Throws(Throwable::class) suspend fun send(url: String, payload: JsonObject): SendResult /* POST JSON; 2xx → Success; url no https://discord.com/api/webhooks/… → HttpError(400) */ }
```
- [ ] **Step 1: Tests que fallan** — `RemindersTest`: ruta con 2 saltos activos y `now` 30 min antes de caducar el primero → 4 avisos (15 min y caducidad del 1.º; 1 h ya pasó; los tres del 2.º si está a >1 h); ruta DISABLED → 0; en papelera → 0; salto COLLAPSED → 0 para ese salto; ids distintos entre saltos y tipos y estables entre llamadas. `DiscordEmbedTest`: paridad campo a campo con `buildPayload` de Flutter (colores, `inline`, footer, timestamp ISO UTC, `recordedBy` solo con nombre). `DiscordWebhookTest`: 204 → Success; 429 → HttpError con cuerpo; excepción de red → NetworkError; URL que no es de Discord → HttpError(400) sin llamar.
- [ ] **Step 2: Implementación** y `./gradlew :shared:jvmTest --tests '*reminders*' --tests '*discord*' --tests '*Expiry*'` — Expected: PASS.
- [ ] **Step 3: Commit** — `avisos (1 h, 15 min, caducidad), embed y webhook de Discord, caducidad derivada — paridad con Flutter`.

### Task 5: Catálogo de zonas, sugerencias y salidas (`shared/zones`)

**Files:** `shared/data/*.json` (copiados por `scripts/sync-data.sh` desde `/root/projects/avalon-tracker/src/data/`: `avalon-zones.json`, `avalon-zone-names.json`, `chest-loot.json`, `world-meta.json`), `shared/src/commonMain/…/zones/{Assets.kt, ZoneCatalog.kt, ZoneSuggest.kt, WorldGraph.kt}`, `Assets.jvm.kt` (lee `AT_DATA_DIR`), `Assets.native.kt` (lee `SIMCTL_CHILD_AT_DATA_DIR`/`AT_DATA_DIR` con `platform.posix`), tests `ZoneSuggestTest.kt`, `ZoneCatalogTest.kt`, `WorldGraphTest.kt`, fixture `exits.json`.

**Interfaces (Produces):**
```kotlin
fun interface AssetReader { fun read(path: String): ByteArray? }   // la app inyecta el suyo (assets Android, bundle iOS); tests usan el de fichero
expect fun testAssetReader(): AssetReader
@Serializable data class ZoneItem(val type: String, val size: String, val count: Int, val tier: Int? = null)
@Serializable data class ZoneNode(val type: String, val tier: Int, val count: Int)
@Serializable data class ZoneMob(val kind: String, val resource: String? = null, val tier: Int? = null, val rank: String? = null, val name: String? = null, val count: Int)
@Serializable data class ZoneMarker(val kind: String, val type: String, val size: String, val tier: Int? = null, val x: Double, val y: Double)
@Serializable data class ZoneMap(val min: List<Double>, val max: List<Double>, val markers: List<ZoneMarker>)
@Serializable data class AvalonZone(val name: String, val clusterId: String, val tier: Int, val zoneClass: String, val hasHideout: Boolean, val resources: List<ZoneItem>, val chests: List<ZoneItem>, val dungeons: List<ZoneItem>, val nodes: List<ZoneNode>, val mobs: List<ZoneMob>, val map: ZoneMap)
class ZoneCatalog(reader: AssetReader) { val zones: List<AvalonZone> /* lazy */; val names: List<String>; fun byName(name: String): AvalonZone? /* sin distinguir mayúsculas */; fun family(zoneClass: String): String /* royal|outlands|hideout|deep|standard, como zoneFamily de la web */; fun chestLoot(type: String, size: String, tier: Int): List<LootCategory> /* de chest-loot.json */; fun resourceTiers(z): List<Pair<String, Int>> /* como zoneResourceTiers de la web (≥ T4, tier de zona si no hay nodos) */ }
object ZoneSuggest { fun suggest(query: String, names: List<String>, max: Int = 8): List<String> /* puerto exacto de src/lib/zone-suggest.ts: norm = minúsculas y solo a-z; <3 letras → vacío; empieza-por primero, luego contiene, alfabético */ }
class WorldGraph(reader: AssetReader) { val worldNames: List<String> /* claves de pvp sin nombres numéricos */; fun pvp(name: String): String?; fun nearestRoyalCity(name: String): Nearest? /* BFS maxDepth 12; ciudades: Lymhurst, Martlock, Thetford, Bridgewatch, Fort Sterling; start = objetivo → hops 0 */; fun nearestRoyalPortals(name: String, n: Int = 2): List<Nearest> /* portales "<Ciudad> Portal", BFS hasta n */; fun market(name: String): String? /* ciudad royal o, si no hay, la del portal más cercano ("X Portal" → X) */ }
data class Nearest(val name: String, val hops: Int)
data class LootCategory(val category: String, val tiers: List<Int>)   // de chest-loot.json (materials, gear, silver, shards, fame_books, treasures, tokens, artefacts)
```
- [ ] **Step 1: `scripts/sync-data.sh`** (copia los 4 JSON y escribe `shared/data/SOURCE` con el commit del repo web) y ejecutarlo.
- [ ] **Step 2: Tests que fallan** — `ZoneSuggestTest` (los mismos casos que `tests/lib/zone-suggest.test.ts` de la web: léelo y tradúcelos), `ZoneCatalogTest` (400 zonas; `byName("casitos-atinaum")` → tier 6, familia `outlands`, 7 bichos, cofres con tier; `resourceTiers` de Casitos = FIBER 7,6,5 + HIDE 6,5; `chestLoot("GREEN","small",6)` empieza por `materials`), `WorldGraphTest` con `exits.json` generado por un script del repo web (`scripts/export-exits-fixtures.ts` con `nearestRoyalCity`/`nearestRoyalPortals` para 12 zonas: Battlebrae Lake → portales Bridgewatch 7 y Lymhurst 9, ciudad null → market Bridgewatch; una zona amarilla con ciudad; Lymhurst → hops 0; nombre inexistente → null).
- [ ] **Step 3: Implementación**; `./gradlew :shared:jvmTest :shared:linuxX64Test --tests '*zones*'` — Expected: PASS (el nativo lee los JSON por la ruta de entorno).
- [ ] **Step 4: Commit** — `zonas: catálogo de las 400 zonas, sugerencias y salidas (BFS del mapa del mundo) con vectores de la web`.

### Task 6: Cliente HTTP de la API v1 (`shared/net`)

**Files:** `shared/src/commonMain/…/net/{Dto.kt, ApiError.kt, AvalonApi.kt}`, tests `AvalonApiTest.kt` con `MockEngine`, fixtures `shared/src/commonTest/fixtures/api/*.json` (respuestas reales copiadas de los tests de la web: `tests/db/{devices-api,sync,shares,prices}.test.ts` y de producción con `curl` a `/api/v1/zones/casitos-atinaum` y `/prices`).

**Interfaces (Produces):**
```kotlin
class ApiException(val status: Int, val code: String, override val message: String, val retryAfterMs: Long? = null): Exception(message)
class NetworkException(cause: Throwable): Exception(cause)
@Serializable data class ClaimResponse(val token: String, val deviceId: String, val userId: String, val isGuest: Boolean)
@Serializable data class MeResponse(val id: String, val isGuest: Boolean, val name: String?)
@Serializable data class MapSummary(val id: String, val name: String, val kind: String, val myRole: String?, val updatedAt: String)
@Serializable data class RouteRow(val id: String, val notes: String?, val status: String, val disabledAt: String?, val deletedAt: String?, val updatedAt: String, val createdAt: String? = null)   // ⚠️ confirmar campos leyendo routeRow() en src/lib/sync.ts
@Serializable data class HopRow(val routeId: String, val fromZone: String, val toZone: String, val order: Int, val portalSize: Int, val expiresAt: String, val status: String, val statusNote: String?, val deletedAt: String?, val updatedAt: String)
@Serializable data class RouteChange(val id: String, val notes: String? = null, val status: String? = null, val disabledAt: String? = null, val deletedAt: String? = null, val baseUpdatedAt: String? = null)
@Serializable data class HopChange(val routeId: String, val fromZone: String, val toZone: String, val order: Int, val portalSize: Int, val expiresAt: String, val status: String? = null, val statusNote: String? = null, val deletedAt: String? = null, val baseUpdatedAt: String? = null)
@Serializable data class ChangeKey(val kind: String, val id: String? = null, val routeId: String? = null, val fromZone: String? = null, val toZone: String? = null)
@Serializable data class PullResult(val routes: List<RouteRow>, val hops: List<HopRow>, val serverTime: String, val hasMore: Boolean = false, val next: String? = null)
@Serializable data class PushResult(val applied: List<Applied>, val rejected: List<Rejected>, val serverTime: String) ; Applied(key, server: JsonObject) ; Rejected(key, reason, server: JsonObject?)
@Serializable data class ShareLink(val id: String, val role: String, val url: String, val createdAt: String)
@Serializable data class DeviceInfo(val id: String, val name: String, val createdAt: String, val lastUsedAt: String?, val current: Boolean = false)
class AvalonApi(val baseUrl: String = "https://avalontracker.app", private val token: () -> String?, engine: HttpClientEngine, userAgent: String) {
  suspend fun claimDevice(code: String, deviceName: String): ClaimResponse           // POST /api/v1/devices/claim (sin token)
  suspend fun createGuest(deviceName: String): ClaimResponse                        // POST /api/v1/guest
  suspend fun me(): MeResponse ; suspend fun mergeGuest(guestToken: String)          // GET /api/v1/me · POST /api/v1/me/merge { guestToken }
  suspend fun devices(): List<DeviceInfo> ; suspend fun revokeDevice(id: String)      // GET/DELETE /api/v1/devices[/{id}]
  suspend fun maps(): List<MapSummary> ; suspend fun createMap(anchorZone: String?): MapSummary
  suspend fun pull(mapId: String, since: String?): PullResult                        // GET /api/v1/maps/{id}/changes?since=
  suspend fun push(mapId: String, routes: List<RouteChange>, hops: List<HopChange>): PushResult
  suspend fun shares(mapId): List<ShareLink> ; createShare(mapId, role) ; revokeShare(mapId, shareId) ; joinShare(token): JoinResult
  suspend fun zone(slug: String): JsonObject ; suspend fun zonePrices(slug: String, server: String, enchant: Int): ZonePrices   // públicas, sin token
}
```
Todo `suspend` público con `@Throws(Throwable::class)` (memoria `reference_kmp_skie_gotchas`: sin él Swift aborta). Errores: `!2xx` → `ApiException` con `error.code`/`message`/`retryAfterMs` del JSON de la web; excepciones de Ktor → `NetworkException`. Cabeceras: `Authorization: Bearer` cuando hay token (nunca en las públicas), `User-Agent: AvalonTracker-KMP/2.0.0 (<plataforma>)`.

- [ ] **Step 1: Tests que fallan** con `MockEngine` que valida método, ruta, cabeceras y cuerpo y responde con las fixtures: claim OK; claim 404 (`CODE_INVALID`) → `ApiException`; 429 con `retryAfterMs`; `pull` con `hasMore`; `push` con `applied`/`rejected`; públicas sin `Authorization`; `zonePrices` con `server=east&enchant=1`.
- [ ] **Step 2: Implementación**; `./gradlew :shared:jvmTest --tests '*net*'` — Expected: PASS.
- [ ] **Step 3: Commit** — `cliente de la API v1 (dispositivos, mapas, cambios, enlaces, zonas, precios) con fixtures reales`.

### Task 7: Motor de sincronización (`shared/sync`) 🔴

**Files:** `shared/src/commonMain/…/sync/{SyncModels.kt, SyncStore.kt, SyncEngine.kt}`, tests `SyncEngineTest.kt` con `FakeServer` (implementa las reglas de §6 sobre `MockEngine` o directamente una `AvalonApi` falsa) e `InMemorySyncStore`.

**Interfaces (Produces):**
```kotlin
data class LocalRoute(val route: Route, val mapId: String, val serverUpdatedAt: String?, val dirty: Boolean)
data class LocalHop(val routeId: String, val hop: Hop, val serverUpdatedAt: String?, val dirty: Boolean)
interface SyncStore {
  suspend fun dirtyRoutes(mapId: String): List<LocalRoute>; suspend fun dirtyHops(mapId: String): List<LocalHop>
  suspend fun applyServerRoute(mapId: String, row: RouteRow)      // upsert por id; deja dirty=false; si deletedAt → marca saltos borrados
  suspend fun applyServerHop(mapId: String, row: HopRow)          // upsert por (routeId, from, to); dirty=false
  suspend fun dropLocalRoute(routeId: String)                     // not_in_map: se quita de la copia local
  suspend fun cursor(mapId: String): String?; suspend fun setCursor(mapId: String, iso: String)
}
data class SyncReport(val pushed: Int, val rejectedStale: Int, val droppedNotInMap: Int, val pulled: Int, val pages: Int)
class SyncEngine(private val api: AvalonApi, private val store: SyncStore, private val batch: Int = 200) {
  @Throws(Throwable::class) suspend fun sync(mapId: String): SyncReport
}
```
Algoritmo de `sync(mapId)`: (1) **push** por lotes ≤ `batch` de rutas y saltos sucios (rutas primero): `applied` → `applyServerRoute/Hop(server)` (adopta `updatedAt` nuevo, limpia `dirty`); `rejected.stale` → `applyServer…(server)` (el servidor manda, se pierde lo local); `rejected.not_in_map` → `dropLocalRoute`. Si el push lanza (red/5xx), **no** se toca nada y se propaga. (2) **pull** desde `cursor(mapId)` (null → todo) en bucle mientras `hasMore` con `since = next`; cada fila → `applyServer…`; al terminar `setCursor(serverTime)`. Una fila local sucia que **también** llega en la bajada no se pisa (la subida acaba de resolverla; la fila del servidor ya es la nuestra). (3) Devuelve el informe. Nunca lee el reloj del cliente para decidir nada.

- [ ] **Step 1: Tests que fallan** (cada uno con `FakeServer` que aplica las reglas de la web: crea por id nuevo, `stale` si `baseUpdatedAt ≠ updatedAt`, `not_in_map` si la ruta pertenece a otro mapa, `updatedAt` nuevo en cada cambio; y paginación de 2 en 2):
  1. Crear ruta local con 2 saltos → tras `sync`: en el servidor con nuestro id, local limpio con `serverUpdatedAt` = el del servidor.
  2. Conflicto: el servidor tiene la nota «B» con `updatedAt` t2; local editó sobre base t1 → rechazo `stale` → la copia local pasa a «B»/t2, sin duplicados (Review Focus 1).
  3. Reloj del cliente +2 h: nada cambia (el motor no usa reloj) (Review Focus 5).
  4. Fallo de red a mitad del push (el fake lanza en la segunda llamada) → excepción, nada marcado limpio; segunda ejecución sube lo mismo sin duplicar (idempotencia por id/clave) (Review Focus 2).
  5. Bajada paginada (5 rutas, límite 2): 3 páginas, `cursor` = `serverTime` final, y una ruta borrada en el servidor (`deletedAt`) llega y marca sus saltos.
  6. Ruta de otro mapa (`not_in_map`) → desaparece de la copia local y no se reintenta.
- [ ] **Step 2: Implementación**; `./gradlew :shared:jvmTest :shared:linuxX64Test --tests '*sync*'` — Expected: 6/6 PASS en ambos objetivos.
- [ ] **Step 3: Commit** — `motor de sincronización: el servidor manda, lotes de 200, paginación, idempotente, sin reloj del cliente`.

### Task 8: Capa de datos en `composeApp` (Room, DataStore, repositorios)

**Files:** `composeApp/src/commonMain/…/data/db/{AppDatabase.kt, Entities.kt, Daos.kt}`, `data/{Settings.kt, RouteRepository.kt, MapRepository.kt, RoomSyncStore.kt, SyncCoordinator.kt}`, `platform/Platform.kt`, `di/AppGraph.kt`, `src/androidMain/…/DatabaseBuilder.android.kt`, `src/desktopMain/…/DatabaseBuilder.desktop.kt`, `src/iosMain/…/DatabaseBuilder.ios.kt` (misma forma que Royal Forge), `composeApp/schemas/`; tests `desktopTest/…/data/{RouteRepositoryTest.kt, RoomSyncStoreTest.kt, TrashSweepTest.kt}`.

**Interfaces (Produces):**
```kotlin
// Entities.kt — sufijo Entity (evita la colisión de nombres en el export ObjC)
@Entity(tableName = "maps") data class MapEntity(@PrimaryKey val id: String, val name: String, val kind: String, val myRole: String?, val updatedAt: String, val syncCursor: String?)
@Entity(tableName = "routes", indices = [Index("mapId"), Index("deletedAt")]) data class RouteEntity(@PrimaryKey val id: String, val mapId: String?, val createdAt: Long, val status: String, val disabledAt: Long?, val notes: String?, val deletedAt: Long?, val serverUpdatedAt: String?, val dirty: Boolean)
@Entity(tableName = "hops", primaryKeys = ["routeId","fromZone","toZone"], indices = [Index("routeId"), Index("expiresAt")]) data class HopEntity(val routeId: String, val fromZone: String, val toZone: String, val sortOrder: Int, val portalSize: Int, val expiresAt: Long, val status: String, val statusNote: String?, val deletedAt: Long?, val serverUpdatedAt: String?, val dirty: Boolean)
const val DATABASE_FILE = "avalontracker.db"   // nuevo; la de Flutter (avalon_tracker.sqlite) solo se lee en la migración
// Settings.kt (DataStore preferences): webhookUrl, displayName, languageCode?, themeMode (system|light|dark), dynamicColor (true), gameServer (europe), deviceToken?, userId?, isGuest?, deviceId?, currentMapId?, flutterMigrated (false), lastSyncAt?
class RouteRepository(db, clock) { fun watchRoutes(mapId: String?): Flow<List<RouteWithHops>> /* sin papelera, con estados derivados */; fun watchTrash(mapId: String?): Flow<List<RouteWithHops>>; suspend fun create(mapId: String?, hops: List<HopInput>, notes: String?): String /* id */; suspend fun edit(routeId, hops, notes); suspend fun setHopStatus(routeId, from, to, status, note); suspend fun extendHop(routeId, from, to, by: Duration); suspend fun disable(routeId) / reactivate / softDelete / restore / hardDelete; suspend fun sweepTrash(now) /* 7 días */; suspend fun checkExpirations(now): Boolean /* deriva EXPIRED en saltos y rutas, como Flutter */ ; suspend fun adoptLocalRoutesInto(mapId) /* mapId null → mapId, dirty=true */ }
data class HopInput(val fromZone: String, val toZone: String, val portalSize: Int, val remaining: Duration, val status: HopStatus = ACTIVE, val statusNote: String? = null)
class RoomSyncStore(db): SyncStore
class SyncCoordinator(api, store, settings, routes, scope) { val state: StateFlow<SyncState> /* Idle|Syncing|Error(msg)|Offline */; fun requestSync(reason: String) /* agrupa 2 s */; suspend fun syncNow(): SyncReport? /* tras cada bajada: checkExpirations + scheduleReminders + refreshWidget (§6.3) */; suspend fun link(claim: ClaimResponse, deviceName) /* guarda token; crea mapa personal si no hay; adopta rutas locales */; suspend fun unlink() }
interface Platform { val clientInfo; val deviceLanguage: String; val supportsDynamicColor: Boolean; fun readAsset(path): ByteArray?; fun dataDir(): String; fun share(text, subject); suspend fun scanQr(): String?; fun openUrl(url); fun openAppLanguageSettings(); suspend fun requestNotificationPermission(): Boolean; fun notificationsAllowed(): Boolean; fun scheduleReminders(list: List<Reminder>); fun cancelReminders(ids: List<Int>); fun refreshWidget(next: NextPortal?); fun onSyncStateChanged(); fun clipboard(text) }
```
Comportamientos que el repositorio hereda de Flutter (`lib/core/routes/route_repository.dart`, léelo): `_guardEdges` (no permite dos saltos con la misma arista), tras cada mutación reprograma avisos y widget (`Platform.scheduleReminders`/`refreshWidget`), `checkExpirations` cada 30 s en primer plano (`ExpirationService`).

- [ ] **Step 1: Tests que fallan** (`desktopTest`, Room con `BundledSQLiteDriver` en fichero temporal): crear/editar/borrar/restaurar; arista duplicada rechazada; `sweepTrash` borra a los 7 días y no antes; `checkExpirations` deriva estados; `RoomSyncStore.applyServerHop` hace upsert por clave natural y limpia `dirty` (Review Focus 1); `adoptLocalRoutesInto` marca `dirty`.
- [ ] **Step 2: Implementación**; `./gradlew :composeApp:desktopTest --tests '*data*'` — Expected: PASS; `composeApp/schemas/…/1.json` generado y commiteado.
- [ ] **Step 3: Commit** — `datos: Room (mapas, rutas, saltos con campos de sincronización), ajustes en DataStore, repositorios y coordinador de sincronización`.

### Task 9: i18n — 23 idiomas desde los ARB + textos nuevos

**Files:** `scripts/i18n/arb_to_compose.py`, `shared/i18n/extra/{en,es,…}.json` (claves nuevas), `composeApp/src/commonMain/composeResources/values[-xx]/strings.xml` (generados), `shared/src/commonMain/…/i18n/LogicStrings.kt` (generado: textos de avisos y Discord por idioma), `composeApp/src/commonMain/…/i18n/Languages.kt` (+ `LocalAppLocale` expect/actual copiados de Royal Forge), banderas `drawable/flag_*.png` copiadas de `avalontracker-app/assets/flags/`; test `desktopTest/…/i18n/StringsCompletenessTest.kt` y `scripts/i18n/check.py`.

Reglas del script: lee `../avalontracker-app/lib/l10n/app_<code>.arb` (ruta por argumento) + `shared/i18n/extra/<code>.json`; clave ARB `camelCase` → `snake_case`; `{n}` → `%1$d` / `{from}` → `%2$s` en orden de aparición (tipos según `@clave.placeholders`, `int` → `d`, `String` → `s`); ICU `{count, plural, =1{…} other{…}}` → `<plurals name>` con `one`/`other` (y `few`/`many` si existen); apóstrofos y comillas escapados para XML; carpeta `values` para `en`, `values-<code>` para el resto (`pt` → `values-pt`, `zh` → `values-zh`, `fil` → `values-fil`); `LogicStrings.kt` = `object LogicStrings { fun reminderTexts(lang: String): ReminderTexts; fun discordTexts(lang: String): DiscordTexts }` con las 9 claves de avisos/Discord de los 23 idiomas y caída a `en`. **Claves nuevas** (todas en los 23): cuenta/vínculo (`account_*`, `link_*`, `devices_*`), mapas y enlaces (`maps_*`, `share_link_*`), zonas (`zones_*`, `zone_*`, `loot_*`, `mob_*`, `prices_*`: reutilizar las traducciones de `src/i18n/public/*.ts` de la web para los 11 idiomas y traducir los 12 restantes), salidas (`exits_*`), sincronización (`sync_*`), papelera/portal (`portal_size_7`, `portal_size_20`), tema (`theme_*`).

- [ ] **Step 1: Test que falla** — `StringsCompletenessTest` (desktop): cada `values-xx/strings.xml` tiene exactamente las claves de `values/strings.xml`, ningún valor vacío, mismos marcadores `%n$` que EN; 23 carpetas.
- [ ] **Step 2: Script + textos nuevos**; `python3 scripts/i18n/arb_to_compose.py ../avalontracker-app/lib/l10n && python3 scripts/i18n/check.py` — Expected: `23 idiomas · N claves · OK`; `./gradlew :composeApp:desktopTest --tests '*i18n*'` PASS.
- [ ] **Step 3: Commit** — `i18n: los 23 idiomas de la app Flutter generados desde los ARB, textos nuevos de mapas/zonas/sincronización, tabla de textos de lógica`.

### Task 10: UI de paridad (rutas, nueva ruta, papelera, ajustes, tema)

**Files:** `composeApp/src/commonMain/…/{App.kt, theme/Theme.kt, navigation/AppNavigation.kt, ui/routes/*, ui/create/*, ui/trash/TrashScreen.kt, ui/settings/{SettingsScreen.kt, LanguagePicker.kt}}`, `di/ViewModels.kt`; capturas `desktopTest/…/Screenshots.kt`.

Comportamiento (paridad §9.4, leyendo cada pantalla Flutter antes de escribir la suya):
- **Rutas**: barra con `FilterChip` All/Active/Expired/Disabled (estado derivado); lista de `RouteCard` (etiqueta, chips por salto con estado y **cuenta atrás en vivo** cada segundo `d h m s` → `h m` cuando > 1 día; menú: enviar a Discord, compartir, editar, **ampliar tiempo** (+15 min/+1 h por salto, `extendHop`), desactivar/reactivar, borrar con confirmación); vacío con texto de Flutter; FAB «Nueva ruta»; tirar para sincronizar (solo si hay token) con estado `SyncState` en un `SnackBar`; tick de 30 s (`checkExpirations`).
- **Nueva/editar ruta**: hasta **12** saltos encadenados (el `from` del siguiente = `to` del anterior), autocompletado ≥ 3 letras con `ZoneSuggest` (catálogo Avalon **+** zonas del mundo, como en Flutter), portal **7/20** (segmento; si se edita un salto heredado 2/40 se muestra su valor y no se ofrece), tiempo restante con selector de horas (0–20) y minutos (0/15/30/45), estado y nota por salto, notas de ruta (≤ 200), validación (aristas repetidas, tiempo > 0).
- **Papelera**: rutas borradas con fecha, restaurar, borrar definitivamente, aviso de 7 días.
- **Ajustes**: webhook (validación de URL de Discord), nombre visible, idioma (selector con banderas y «beta» como en Flutter; aplica con `LocalAppLocale`), tema (sistema/claro/oscuro) y color dinámico (Android 12+), versión, enlaces legales. (Cuenta, dispositivos y mapas: Tarea 12.)
- **Tema**: Material 3; tokens de `royalforge-kmp/design/tokens.json` si existen (`scripts/sync-tokens.py` de Royal Forge) con el acento de Avalon (índigo de la web `#6366f1`); modo oscuro por defecto como la web.

- [ ] **Step 1: ViewModels con tests** (desktopTest, sin UI): `RoutesViewModel` filtra por estado derivado y expone el `now` de tick; `CreateRouteViewModel` valida (12 saltos, aristas, tiempo) y construye `HopInput` con `remaining` correcto. RED → GREEN.
- [ ] **Step 2: Pantallas** + `Screenshots.kt` (Compose desktop `runComposeUiTest`, 412×915, oscuro y claro, datos de demo de `lib/dev/demo_seed.dart`) que escribe PNG en `composeApp/build/screenshots/`. Run: `./gradlew :composeApp:desktopTest --tests '*Screenshots*'` y **mirar cada PNG** (Read): rutas con 3 rutas de demo (activa/caducada/desactivada), nueva ruta con 2 saltos, papelera, ajustes en ES y JA.
- [ ] **Step 3: Commit** — `UI de paridad: rutas con filtros y cuenta atrás, nueva/editar ruta (12 saltos, 7/20), papelera, ajustes y tema`.

### Task 11: Compartir e importar (enlace, QR, código, Discord)

**Files:** `ui/share/{ShareRouteSheet.kt, ImportRouteScreen.kt}`, `ui/routes/DiscordSend.kt`; test `desktopTest/…/ImportViewModelTest.kt`.

- **Compartir** (hoja inferior): código v1 de `RouteCodec.encode`, QR (`qrose`, contenido = `https://avalontracker.app/i/<código>`), botones copiar código / copiar enlace / compartir (hoja del sistema vía `Platform.share`), y «Enviar a Discord» (usa `DiscordEmbed` + `DiscordWebhook` con el webhook y nombre de Ajustes; sin webhook → lleva a Ajustes; resultado en `SnackBar`).
- **Importar**: campo para pegar (acepta código, `avalontracker://r/…`, `https://avalontracker.app/i/…`), botón escanear (`Platform.scanQr()`), vista previa (saltos, tiempos, caducados en gris), «Importar» crea la ruta con `toHopInputs(now)` (tiempos restantes desde `expiresAt`, mínimo 0), aviso si todo está caducado; también se abre desde el enlace profundo `r/<código>` y desde `/i/<código>` (App Links).
- [ ] **Step 1: Test** `ImportViewModelTest`: pegado de las tres formas, código inválido → error, ruta totalmente caducada → aviso, `toHopInputs` con `now`. RED → GREEN.
- [ ] **Step 2: Pantallas + capturas** (hoja de compartir con QR, importar con vista previa) y mirarlas.
- [ ] **Step 3: Commit** — `compartir (enlace, QR, código, Discord) e importar (pegar o escanear) con el códec v1`.

### Task 12: Lo nuevo — cuenta y vínculo, mapas y enlaces, zonas y salidas

**Files:** `ui/settings/{AccountSection.kt, DevicesSheet.kt}`, `ui/maps/{MapsScreen.kt, ShareLinksSheet.kt}`, `ui/zones/{ZonesScreen.kt, ZoneDetailScreen.kt, ZoneMiniMap.kt, ZonePrices.kt}`, `ui/exits/ExitsScreen.kt`, navegación (pestañas: Rutas · Zonas · Salidas · Ajustes; Mapas desde la barra de Rutas), `data/SyncCoordinator.kt` (flujos de vínculo), tests `desktopTest/…/{LinkFlowTest.kt, ZonesViewModelTest.kt}`.

- **Cuenta** (Ajustes): sin vínculo → «Sincronizar en todos tus dispositivos» con tres caminos de §5.2: **escanear QR** de la web (`scanQr` → `claimDevice(code, deviceName)`), **Discord** (`openUrl("https://avalontracker.app/link/app")` → vuelve por `avalontracker://linked?code=…` → `claimDevice`; si ya había token de invitado → `mergeGuest(guestToken)` con el nuevo y se revoca el viejo), **crear invitado** (`createGuest`). Con vínculo → nombre/invitado, «Dispositivos» (lista y revocar; el actual marcado), «Desvincular» (borra token local; las rutas se quedan). Tras vincular: si no hay mapa → `createMap` personal; `adoptLocalRoutesInto(mapId)`; `syncNow()`.
- **Mapas**: lista de `maps()` (nombre, tipo, mi rol), mapa actual, crear personal (máx. 3 → mensaje del 400), «Enlaces compartidos» (crear ver/editar, copiar, revocar; solo mapas PERSONAL con rol ADMIN), «Abrir enlace `/m/<token>`» → `joinShare` y el mapa aparece.
- **Zonas**: buscador con `ZoneSuggest` (≥ 3 letras) y filtros (tier, recurso, cofres, mazmorras, clase) como `/zones`; ficha con minimapa (Canvas con los marcadores, colores de la web), recursos con tiers, cofres con tier real y **qué puede salir** (`chestLoot`), mazmorras, bichos (etiquetas de `mob_*`), **precios** (`zonePrices` de la API con selector de servidor persistido en Ajustes y encantamiento; antigüedad de cada precio; «sin datos»; sin red → último resultado en memoria + aviso). Enlace «Ver en la web».
- **Salidas**: buscador de zona del mundo (`WorldGraph.worldNames` + Avalon), resultado como `/exits` (ciudad y portales), «dónde vender» con zona de origen (prellenada desde la ficha de zona) y precios en el mercado más cercano (`WorldGraph.market`).
- [ ] **Step 1: Tests** — `LinkFlowTest` (coordinador con `MockEngine`: QR → token guardado, mapa creado, rutas adoptadas y subidas; Discord con invitado previo → `mergeGuest` llamado con los dos tokens; error 404 del código → estado de error y nada guardado), `ZonesViewModelTest` (filtros y sugerencias). RED → GREEN.
- [ ] **Step 2: Pantallas + capturas** (cuenta sin/con vínculo, mapas, zonas lista, ficha de Casitos-Atinaum con minimapa y precios simulados, salidas con «dónde vender») y mirarlas.
- [ ] **Step 3: Commit** — `cuenta y vínculo (QR, Discord, invitado), mapas y enlaces compartidos, zonas con ficha y precios, salidas con dónde vender`.

### Task 13: Android — Activity, enlaces, avisos, sincronización en segundo plano, widget, QR, migración desde Flutter

**Files:** `androidApp/src/main/{AndroidManifest.xml, res/xml/avalon_route_widget_info.xml, res/values/strings.xml (nombre, widget), res/mipmap-*}`, `androidApp/src/main/kotlin/…/{AvalonApp.kt, MainActivity.kt, ScanActivity.kt, AvalonRouteWidgetProvider.kt, util/{Reminders.kt, ReminderReceiver.kt, BootReceiver.kt, SyncWorker.kt, FlutterMigration.kt}}`, `composeApp/src/androidMain/…/AndroidPlatform.kt`; tests `desktopTest/…/FlutterMigrationTest.kt` (la lectura de la BD drift es Kotlin puro sobre `androidx.sqlite`, así que se prueba en escritorio con una BD creada con el DDL de drift) y `androidApp/src/test/…/ReminderSchedulingTest.kt` (Robolectric opcional; si no, se cubre en el humo).

- Manifest: permisos `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `CAMERA`, `SCHEDULE_EXACT_ALARM` **no** (inexacto como la Flutter); `MainActivity` (`singleTask`) con filtros: launcher, `avalontracker://` (`r/`, `linked`), y `https://avalontracker.app` con `android:autoVerify="true"` para `/i/` y `/m/` (la verificación real depende de `assetlinks.json`, que espera la huella de Play: hasta entonces el sistema pregunta); receptor `.AvalonRouteWidgetProvider` (Glance) con el mismo `xml/avalon_route_widget_info.xml`; `ReminderReceiver`, `BootReceiver`; `SyncWorker` periódico 15 min (`NetworkType.CONNECTED`, solo si hay token) + único `enqueueUniqueWork` tras cambios (2 s de agrupación ya en el coordinador); canal `avalon_route_expiry`.
- `AndroidPlatform`: assets desde `context.assets` (los JSON de `shared/data` se copian a `androidApp/src/main/assets` por `scripts/sync-data.sh`), `scanQr` abre `ScanActivity` (CameraX + ML Kit, devuelve el primer QR válido), `share` con `ACTION_SEND`, `scheduleReminders` con `AlarmManager.setAndAllowWhileIdle` + `PendingIntent` por id, `refreshWidget` escribe el «próximo portal» (from, to, tamaño, expiresAt) en DataStore y `updateAll()`; el widget usa un `Chronometer` vía `AndroidRemoteViews` como el actual para la cuenta atrás sin despertar la app.
- **Migración Flutter** (primer arranque, `flutterMigrated=false`): si existe `<filesDir>/avalon_tracker.sqlite`, leerla con `BundledSQLiteDriver` en solo lectura: tablas `routes(id, created_at, status, disabled_at, notes, version, remote_id, deleted_at)` y `route_hops(id, route_id, sort_order, from_zone, to_zone, portal_size, expires_at, status, status_note, deleted_at, created_at, updated_at)` (fechas drift = segundos epoch; estados en minúsculas) → `RouteEntity` con id nuevo UUID por ruta, `mapId=null`, `HopEntity` por salto; `FlutterSharedPreferences.xml` (`flutter.webhook_url`, `flutter.display_name`, `flutter.language_code`) → Settings. **No borra** la BD antigua; marca `flutterMigrated=true`; idempotente.
- [ ] **Step 1: Test que falla** — `FlutterMigrationTest`: crea una BD con el DDL exacto de drift (copiar de `database.g.dart`), 2 rutas (una en papelera) y 3 saltos, ejecuta la migración → 2 rutas + 3 saltos en Room, estados/notas/`deletedAt` conservados, segunda ejecución no duplica (Review Focus 3).
- [ ] **Step 2: Implementación**; `./gradlew :composeApp:desktopTest --tests '*Migration*' :androidApp:assembleDebug` — Expected: PASS y APK.
- [ ] **Step 3: Commit** — `Android: enlaces profundos y App Links, avisos con AlarmManager, sincronización con WorkManager, widget Glance, escáner QR, migración desde la app Flutter`.

### Task 14: Puerta de calidad, humo en emulador, AAB firmado

**Files:** `scripts/quality_gate.sh`, `scripts/emulator-smoke.sh`, vault + hub.

- [ ] **Step 1: `scripts/quality_gate.sh`**: `check-common.sh` → `./gradlew :shared:jvmTest :shared:linuxX64Test :composeApp:desktopTest` → cruce del códec (`:shared:jvmTest --tests '*CodecExport*'` escribe `build/codes.txt` con 3 códigos KMP y `node /root/projects/avalon-tracker/scripts/verify-route-codes.mjs build/codes.txt` los decodifica con la web: Review Focus 4) → capturas → `:androidApp:lint`. Run — Expected: todo verde.
- [ ] **Step 2: Humo en el emulador** (`scripts/emulator-smoke.sh`, con la puerta ya verde y sin builds en paralelo): arranca `royalforge-api36` sin ventana (`-no-window -gpu swiftshader_indirect`), instala `assembleDebug`, y con `adb`: abre la app (captura), crea una ruta por UI (`adb shell input` sobre ids o `uiautomator dump`), abre `adb shell am start -a android.intent.action.VIEW -d "avalontracker://r/<código de la web>"` → pantalla de importar (captura), modo avión (`adb shell cmd connectivity airplane-mode enable`) → crear otra ruta funciona (Review Focus 2), notificación programada visible en `adb shell dumpsys alarm | grep avalontracker`, widget añadido (`appwidget`), y **actualización desde Flutter**: instala primero el APK de la Flutter 1.2 (`flutter build apk` en `avalontracker-app` o el APK del último release si está en `/root/projects/legacy-aabs`), crea una ruta allí, instala encima la 2.0 (`adb install -r`) → la ruta aparece (Review Focus 3). Mirar todas las capturas.
- [ ] **Step 3: AAB firmado**: `./gradlew :androidApp:bundleRelease` → `androidApp/build/outputs/bundle/release/androidApp-release.aab`; `jarsigner -verify` y `bundletool validate`. Sin subir.
- [ ] **Step 4: Vault + hub + memoria** (nota fechada «fase 3 — app KMP Android lista para prueba cerrada»; ledger de rulings; `build.py`). Commit final del repo KMP.

### Task 15: Prueba cerrada de Play (SOLO con OK explícito de Crinlorite)

- [ ] Con su OK: `/root/empyre-release/ship-android.sh <aab> internal` (cuenta de servicio de Crintech), notas de la versión EN/ES, y anotar en el vault. Los 12 testers los busca él «cuando toque» (decisión del 26-sep).

---

## Fuera de este plan
- iOS (fase 4): `iosApp` con xcodegen como Royal Forge, WidgetKit, Universal Links, TestFlight que evalúa Crinlorite.
- Logos SVG (antes de la fase 5). Fichas de tienda y capturas (fase 5).
- `ANDROID_SIGNING_SHA256` en Coolify para que los App Links verifiquen (pendiente de él).
- Propuesta a Royal Forge (precios ↔ zonas) y `/zone` de Vigil (spec §13).
