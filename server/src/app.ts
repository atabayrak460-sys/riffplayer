import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import { initDb } from './db/database.js';
import { runMigrations } from './db/migrate.js';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
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
