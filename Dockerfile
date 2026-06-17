# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY server/package.json             ./server/

# Install all deps (devDeps needed to compile TypeScript)
RUN npm ci --workspace=server

# Copy source and compile
COPY server/src         ./server/src
COPY server/tsconfig.json ./server/

RUN npm run --workspace=server build

# Drop devDependencies — only production deps travel to the runtime stage
RUN npm prune --workspace=server --omit=dev

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# Hoisted node_modules already pruned to prod-only deps
COPY --from=build /app/node_modules   ./node_modules
COPY --from=build /app/server/dist    ./server/dist

# SQL migrations must be present at runtime (migrate.ts reads them on startup)
COPY server/migrations                ./server/migrations

# Package manifests (needed for Node module resolution in a workspace layout)
COPY server/package.json              ./server/
COPY package.json                     ./

ENV NODE_ENV=production \
    PORT=4533 \
    HOST=0.0.0.0 \
    DB_PATH=/data/cadence.db

EXPOSE 4533

VOLUME ["/data", "/music"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4533/rest/ping.view?f=json').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
