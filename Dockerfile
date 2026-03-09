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
ENV AUTH_SIMPLE_PASSWORD=""
ENV NEXT_PUBLIC_APP_URL=""
ENV SUPER_ADMIN_EMAIL=""

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

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx scripts/seed.ts && node server.js"]
