# ---- Base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# ---- Build ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects anonymous telemetry — disable in production builds
ENV NEXT_TELEMETRY_DISABLED=1

# Provide a dummy DATABASE_URL so `next build` can compile without a real DB
ENV DATABASE_URL="file:./build-placeholder.db"
RUN npx prisma generate
RUN npx prisma db push
RUN npm run build

# ---- Production ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only what's needed for production
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json

# Next.js standalone output (if enabled) or standard .next
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# Create the data directory (will be overridden by Railway volume mount)
RUN mkdir -p /data && chown nextjs:nodejs /data

# Create backups directory
RUN mkdir -p /app/backups && chown nextjs:nodejs /app/backups

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default DATABASE_URL pointing to persistent volume
ENV DATABASE_URL="file:/data/db.sqlite"
ENV SQLITE_DB_PATH="/data/db.sqlite"

# Push schema to DB on start (creates tables if missing), then start the app
CMD npx prisma db push --skip-generate && npm start
