# ── IndexPilot — production image (Render free-plan compatible) ────────────
# Multi-stage, no native npm deps, so no build toolchain is required.
#
# Runtime notes:
# - Render injects PORT (default 10000); `npm run start` honours it.
# - /api/health is the liveness probe (see render.yaml).
# - Local SQLite lives in /app/data (writable, non-root). The container disk
#   is EPHEMERAL on the free plan — set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
#   to persist user data across redeploys/sleep cycles.

# ---- 1. Install dependencies ------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. Build the app -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. Runtime -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000

# Run as an unprivileged user; give it a writable data dir.
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs \
    && mkdir -p /app/data && chown -R nextjs:nodejs /app/data

COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /app/.next          ./.next
COPY --from=build --chown=nextjs:nodejs /app/public         ./public
COPY --from=build --chown=nextjs:nodejs /app/package.json   ./package.json
COPY --from=build --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs
EXPOSE 10000
CMD ["sh", "-c", "exec npm run start"]
