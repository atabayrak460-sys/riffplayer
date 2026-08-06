import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import { initDb } from './db/database.js';
import { runMigrations } from './db/migrate.js';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { subsonicPlugin } from './routes/subsonic/index.js';
import { apiPlugin } from './routes/api/index.js';
import { ensureAdminUser } from './auth/seed.js';
import { sendError, SubsonicErrorCode } from './routes/subsonic/response.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Web dist is at <repo-root>/web/dist when built in Docker
const WEB_DIST = path.resolve(__dirname, '..', '..', 'web', 'dist');

export interface AppOptions {
  dbPath?: string;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const isDev = process.env.NODE_ENV !== 'production';
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
  });

  const dbPath = options.dbPath ?? process.env.DB_PATH ?? path.join(process.cwd(), 'cadence.db');
  const db = initDb(dbPath);
  await runMigrations(db, MIGRATIONS_DIR);
  ensureAdminUser(db);

  // Without this, an uncaught exception in any handler falls through to
  // Fastify's default JSON error shape — for /rest/* that breaks the "always
  // speak Subsonic" contract every other error path in this codebase honors,
  // since real Subsonic clients expect a status="failed"/<error> envelope
  // (at HTTP 200, matching the rest of sendError's usage) rather than a bare
  // {statusCode, error, message} object they don't know how to parse.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    req.log.error({ err }, 'Unhandled request error');

    if (req.url.startsWith('/rest/')) {
      const q = { ...(req.query as Record<string, string | undefined>), ...((req.body as Record<string, string | undefined>) ?? {}) };
      return sendError(reply, q.f, { code: SubsonicErrorCode.GENERIC, message: 'Internal server error' });
    }

    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    reply.code(statusCode).send({ error: err.message || 'Internal server error' });
  });

  // CSP is disabled: this serves a Vite-built SPA with no nonce/hash setup
  // for its bundled scripts, and helmet's default CSP would block them
  // outright. HSTS is also disabled — self-hosters commonly run this behind
  // plain HTTP (LAN access, or a reverse proxy handling TLS separately), and
  // sending Strict-Transport-Security would make browsers refuse to connect
  // over HTTP again for up to a year; HSTS is the reverse proxy's call to
  // make, not this app's, since it's the one that actually knows whether
  // TLS is in front of it. The other headers (X-Frame-Options,
  // X-Content-Type-Options, Referrer-Policy, etc.) are real, low-risk
  // hardening for a server that's realistically exposed to the internet.
  app.register(helmet, { contentSecurityPolicy: false, hsts: false });

  // No legitimate cross-origin browser use case today (the PWA is served
  // from this same origin; native Subsonic clients aren't subject to CORS
  // at all). `origin: false` means no Access-Control-Allow-Origin is ever
  // sent, so cross-origin fetches are rejected by the browser — same-origin
  // traffic is completely unaffected either way.
  app.register(cors, { origin: false });

  // Registered globally but inert (global: false) except where a route
  // explicitly opts in via its own `config.rateLimit` — Subsonic clients
  // legitimately fire many rapid requests per IP while browsing/streaming,
  // so a blanket limit would break normal use. Only /api/v1/auth/login (the
  // one real "enter a password" endpoint) opts in, guarding against
  // brute-force login attempts.
  app.register(rateLimit, { global: false });

  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(subsonicPlugin, { prefix: '/rest' });
  app.register(apiPlugin, { prefix: '/api/v1' });

  // Serve the React SPA in production (web/dist must exist)
  if (existsSync(WEB_DIST)) {
    app.register(staticPlugin, { root: WEB_DIST, prefix: '/', wildcard: false });
    // SPA catch-all: anything not matching /rest or /api gets index.html
    app.setNotFoundHandler(async (req, reply) => {
      const url = req.url.split('?')[0];
      if (!url.startsWith('/rest') && !url.startsWith('/api')) {
        return reply.type('text/html').sendFile('index.html', WEB_DIST);
      }
      reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
