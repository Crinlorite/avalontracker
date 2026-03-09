# Avalon Tracker

Herramienta para compartir rutas de los Caminos de Avalon (Roads of Avalon) de Albion Online entre clanes de forma privada, con temporizadores en tiempo real y notificaciones a Discord.

## Funcionalidades

### Autenticacion
- Login con Google OAuth2 (NextAuth v5)
- Sin custodia de credenciales: Google gestiona toda la autenticacion
- Sesiones persistentes con soporte PWA (instalable en movil)

### Clanes
- Crear clanes con roles: **Owner** (lider), **Officer** (oficial), **Member** (miembro)
- Aislamiento total entre clanes: un clan jamas ve las rutas de otro
- Sistema de invitacion por codigo personal (sin exponer emails)

### Sistema de invitacion
1. El usuario genera un codigo personal de 8 caracteres (ej: `AX7K-M2P9`)
2. Comparte el codigo con un Officer de su clan (por Discord, chat, etc.)
3. El Officer introduce el codigo en la app y aprueba al usuario
4. Nadie ve el email de nadie - el sistema lo resuelve internamente

### Rutas avalonianas
- Registrar rutas con zona de entrada, zona de salida y tamano de portal (7 o 20)
- Temporizador con cuenta atras en tiempo real (segundo a segundo)
- Colores por urgencia:
  - Verde: mas de 60 minutos
  - Naranja: entre 30 y 60 minutos
  - Rojo: menos de 30 minutos
  - Azul pulsante: expirada
- Deshabilitacion manual por cualquier miembro
- Expiracion automatica via servidor (cada 30 segundos)

### Zonas precargadas
- **316 zonas avalonianas** con tier (T4, T6, T8), recursos, cofres y dungeons
- **1324 zonas del mundo** (Royal y Outlands)
- Autocompletado inteligente al registrar rutas
- Al buscar una zona muestra: nombre, tier, tipo, indicadores de recursos y cofres

### Discord
- Cada clan configura un webhook URL de Discord
- Boton por ruta para enviar la informacion al canal de Discord
- El embed incluye: zonas, tamano del portal, tiempo restante (formato Discord timestamp), quien la registro

### Auditoria
- Registro completo de acciones: quien se unio, quien creo rutas, quien deshabilito, quien fue expulsado
- Visible para Officers y Owner del clan
- Trazabilidad completa para detectar filtraciones

### Panel de administracion
- Acceso exclusivo para el super admin (declarado en variables de entorno)
- Vision global de todas las rutas de todos los clanes
- Declarado en los Terminos de Servicio

## Stack tecnologico

| Capa | Tecnologia |
|------|-----------|
| Frontend | Next.js 16 (App Router) + Tailwind CSS v4 |
| Autenticacion | NextAuth v5 (beta) + Google OAuth2 |
| Base de datos | PostgreSQL + Prisma ORM v7 |
| Realtime | Socket.io |
| Discord | Webhooks (no bot) |
| Deploy | Docker + Nginx (Coolify) |

## Estructura del proyecto

```
avalon-tracker/
├── prisma/
│   └── schema.prisma           # 12 modelos, enums, indices
├── scripts/
│   └── seed.ts                 # Seed de zonas (316 avalon + 1324 mundo)
├── src/
│   ├── app/
│   │   ├── page.tsx            # Landing con login Google
│   │   ├── (auth)/
│   │   │   ├── dashboard/      # Lista de clanes, codigo personal
│   │   │   ├── profile/        # Nombre in-game, generar codigo
│   │   │   ├── clan/[clanId]/  # Rutas, miembros, settings, auditoria
│   │   │   └── admin/          # Panel super admin
│   │   └── api/
│   │       ├── auth/           # NextAuth handler
│   │       ├── clans/          # CRUD clanes + miembros + rutas + webhook + audit
│   │       ├── invite-codes/   # Generar/consultar codigo personal
│   │       ├── zones/          # Busqueda autocompletable de zonas
│   │       ├── profile/        # Actualizar nombre in-game
│   │       └── admin/          # Rutas globales (super admin)
│   ├── components/
│   │   ├── routes/             # RouteTimer, ZoneAutocomplete, CreateRouteModal, DiscordPushButton
│   │   ├── clan/               # ClanTabs, CreateClanModal
│   │   ├── layout/             # Sidebar
│   │   ├── dashboard/          # DashboardClient
│   │   ├── landing/            # LandingLogin
│   │   └── providers/          # SessionProvider
│   ├── lib/
│   │   ├── auth.ts             # Configuracion NextAuth + Google
│   │   ├── prisma.ts           # Cliente Prisma (singleton)
│   │   ├── permissions.ts      # Verificacion de roles
│   │   ├── invite-codes.ts     # Generacion y consumo de codigos
│   │   ├── audit.ts            # Logger de auditoria
│   │   ├── discord.ts          # Envio de embeds via webhook
│   │   └── constants.ts        # Tamanos de portal, colores de timer
│   ├── data/
│   │   ├── avalon-zones.json   # 316 zonas avalonianas
│   │   └── world-zones.json    # 1324 zonas del mundo
│   └── types/
│       └── next-auth.d.ts      # Extension de tipos de sesion
├── server.ts                   # Servidor custom: Next.js + Socket.io + expiracion automatica
├── docker-compose.yml          # PostgreSQL + App + Nginx
├── Dockerfile                  # Multi-stage build (variables declaradas para Coolify)
└── nginx.conf                  # Reverse proxy con soporte WebSocket
```

## API Endpoints

| Metodo | Ruta | Descripcion | Acceso |
|--------|------|-------------|--------|
| GET | `/api/clans` | Listar clanes del usuario | Autenticado |
| POST | `/api/clans` | Crear clan | Autenticado |
| GET | `/api/clans/[id]` | Detalle del clan | Miembro |
| PATCH | `/api/clans/[id]` | Actualizar clan | Owner |
| DELETE | `/api/clans/[id]` | Eliminar clan | Owner |
| GET | `/api/clans/[id]/members` | Listar miembros | Miembro |
| POST | `/api/clans/[id]/members` | Aprobar codigo de invitacion | Officer+ |
| PATCH | `/api/clans/[id]/members/[mid]` | Cambiar rol | Owner |
| DELETE | `/api/clans/[id]/members/[mid]` | Expulsar miembro | Officer+ |
| GET | `/api/clans/[id]/routes` | Listar rutas | Miembro |
| POST | `/api/clans/[id]/routes` | Crear ruta | Miembro |
| PATCH | `/api/clans/[id]/routes/[rid]` | Deshabilitar ruta | Miembro |
| DELETE | `/api/clans/[id]/routes/[rid]` | Eliminar ruta | Officer+ |
| PATCH | `/api/clans/[id]/webhook` | Configurar webhook Discord | Officer+ |
| POST | `/api/clans/[id]/webhook` | Enviar ruta a Discord | Officer+ |
| GET | `/api/clans/[id]/audit` | Log de auditoria | Officer+ |
| GET | `/api/invite-codes` | Mi codigo activo | Autenticado |
| POST | `/api/invite-codes` | Generar codigo personal | Autenticado |
| PATCH | `/api/profile` | Actualizar nombre in-game | Autenticado |
| GET | `/api/zones?q=` | Buscar zonas (autocompletado) | Autenticado |
| GET | `/api/admin/routes` | Todas las rutas (global) | Super Admin |

## Modelo de datos

### Entidades principales

- **User**: Google OAuth, displayName (nombre in-game), personalCode
- **Clan**: nombre, webhook Discord, creador
- **ClanMember**: usuario + clan + rol (Owner/Officer/Member)
- **Route**: zona entrada, zona salida, tamano portal, timer expiracion, estado
- **InviteCode**: codigo de 8 chars, vinculado a usuario, expira en 24h
- **AuditLog**: accion, quien, cuando, detalles
- **Zone**: 1640 zonas precargadas con metadata

### Seguridad entre clanes

```
Clan A ---- solo ve sus datos ----+
                                   +-- Queries siempre filtran por clanId
Clan B ---- solo ve sus datos ----+    + verificacion de membresia
```

Todas las queries validan que el usuario autenticado sea miembro del clan antes de devolver datos. No es solo restriccion de UI, es validacion server-side en cada endpoint.

## Deploy en Coolify

### Prerequisitos

1. Instancia de Coolify corriendo en tu VPS
2. Credenciales de Google OAuth2 ([console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials))
   - Crear OAuth Client ID tipo "Web Application"
   - Redirect URI: `https://tu-dominio.com/api/auth/callback/google`

### Pasos

1. **Crear recurso PostgreSQL** en Coolify (te genera la DATABASE_URL)

2. **Crear recurso** desde GitHub apuntando a este repo

3. **Las variables de entorno estan declaradas en el Dockerfile** y aparecen automaticamente en la UI de Coolify. Rellenar:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | La que genera Coolify al crear PostgreSQL |
| `AUTH_SECRET` | Generar con `openssl rand -base64 32` |
| `AUTH_URL` | `https://tu-dominio.com` |
| `AUTH_GOOGLE_ID` | Client ID de Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | Client Secret de Google Cloud Console |
| `NEXT_PUBLIC_APP_URL` | `https://tu-dominio.com` |
| `SUPER_ADMIN_EMAIL` | Tu email de Google (acceso al panel admin) |

4. **Deploy** - Coolify construye la imagen, ejecuta migraciones, seedea zonas y arranca

### Que pasa en el primer deploy

1. Docker construye la imagen (multi-stage: build + produccion)
2. `prisma migrate deploy` crea las tablas en PostgreSQL
3. `tsx scripts/seed.ts` inserta las 1640 zonas (idempotente con upsert)
4. `node server.js` arranca Next.js + Socket.io en el puerto 3000
5. Nginx hace reverse proxy con soporte WebSocket

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Levantar PostgreSQL (necesitas Docker)
docker compose up db -d

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma migrate dev

# Seedear zonas
npx tsx scripts/seed.ts

# Arrancar en modo desarrollo
npm run dev
```

La app estara disponible en `http://localhost:3000`.

## Socket.io (Realtime)

El servidor custom (`server.ts`) gestiona:

- **Rooms por clan**: al entrar a la pagina de un clan, el cliente se une al room `clan:{clanId}`
- **Eventos emitidos**: `route-created`, `route-disabled`, `route-expired`
- **Expiracion automatica**: cada 30 segundos el servidor revisa rutas con `expiresAt < now()` y `status = ACTIVE`, las marca como `EXPIRED` y notifica al room del clan
- **Timers client-side**: el countdown se calcula localmente a partir de `expiresAt` (UTC). No hay streaming del servidor cada segundo.

## Escalabilidad

| Fase | Usuarios | Infraestructura |
|------|----------|----------------|
| 1 | 1-50 clanes | VPS 5-10 EUR/mes, sobra |
| 2 | 50-500 clanes | Mismo VPS, anadir indices y cache |
| 3 | 500+ clanes | Escalar verticalmente o replica de lectura |

PostgreSQL + un monolito bien hecho aguanta miles de usuarios sin problemas.

## Fuentes de datos

- Zonas avalonianas: [AO-Noki/avalon-roads](https://github.com/AO-Noki/avalon-roads) (316 mapas con tier, recursos, cofres, dungeons)
- Zonas del mundo: [ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) (1324 zonas Royal/Outlands)
- Informacion de portales: [Wiki - Roads of Avalon](https://wiki.albiononline.com/wiki/Roads_of_Avalon)

## Licencia

Proyecto privado.
