# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

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
ENV SUPER_ADMIN_DISCORD_IDS=""
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

# Primer deploy: --force-reset drops y recrea la BD (big-bang, sin users reales).
# TODO: quitar --force-reset después del primer deploy exitoso para evitar wipe en redeploys futuros.
CMD ["sh", "-c", "npx prisma db push --force-reset --accept-data-loss && npx tsx scripts/seed-zones.ts && npx tsx scripts/import-world-graph.ts && npx tsx scripts/precompute-routing.ts && node server.js"]
