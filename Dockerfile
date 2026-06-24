# syntax=docker/dockerfile:1

# ── web build ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS web-build

WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json ./web/

RUN npm ci --workspace=web

COPY web/ ./web/

RUN npm run --workspace=web build

# ── server build ──────────────────────────────────────────────────────────────
FROM node:22-slim AS server-build

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/

RUN npm ci --workspace=server

COPY server/src         ./server/src
COPY server/tsconfig.json ./server/

RUN npm run --workspace=server build
RUN npm prune --workspace=server --omit=dev

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

COPY --from=server-build /app/node_modules   ./node_modules
COPY --from=server-build /app/server/dist    ./server/dist
COPY --from=web-build    /app/web/dist       ./web/dist

COPY server/migrations   ./server/migrations
COPY server/package.json ./server/
COPY package.json        ./

ENV NODE_ENV=production \
    PORT=4533 \
    HOST=0.0.0.0 \
    DB_PATH=/data/cadence.db \
    COVERS_DIR=/data/covers

EXPOSE 4533

VOLUME ["/data", "/music"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4533/rest/ping.view?f=json').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
