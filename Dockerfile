# Stage 1: Builder
FROM node:22.23.4-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# Stage 2: Runner
FROM node:22.23.4-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# Next.js standalone mira HOSTNAME para bindear el servidor; Docker lo setea al
# container ID por defecto, lo que hace que 127.0.0.1:3000 (healthcheck) rechace
# la conexión. Forzamos 0.0.0.0 para escuchar en todas las interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Variables de entorno requeridas (Coolify las detecta y muestra en su UI)
ENV DATABASE_URL=""
ENV AUTH_SECRET=""
ENV AUTH_URL=""
ENV AUTH_TRUST_HOST="true"
ENV NEXT_PUBLIC_APP_URL=""
ENV DISCORD_CLIENT_ID=""
ENV DISCORD_CLIENT_SECRET=""
ENV VIGIL_BOT_API_URL=""
ENV VIGIL_BOT_SHARED_SECRET=""
ENV PRISMA_CLIENT_POOL_SIZE="5"

# Copy standalone output from Next.js
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files for migrations and seeding
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/src/data ./src/data
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD wget --quiet --tries=1 --spider -T 4 http://127.0.0.1:3000/api/health || exit 1

# db push SIN --accept-data-loss ni --force-reset: si el esquema de la imagen
# exige perder datos (quitar o renombrar columnas con datos, unique sobre
# duplicados…), Prisma se niega, el contenedor nuevo no arranca y el cambio se
# decide a mano (copia de la BD y migración puntual), nunca en un despliegue.
# HOSTNAME/PORT explícitos inline como refuerzo a los ENV — Docker o el shell
# pueden sobreescribirlos; aquí garantizamos que node server.js ve lo correcto.
CMD ["sh", "-c", "npx tsx scripts/cleanup-routehop-duplicates.ts && npx prisma db push && npx tsx scripts/seed-zones.ts && npx tsx scripts/import-world-graph.ts && npx tsx scripts/precompute-routing.ts && HOSTNAME=0.0.0.0 PORT=3000 node server.js"]
