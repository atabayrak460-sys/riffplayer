import path from 'path';
import { fileURLToPath } from 'url';
import Fastify, { FastifyInstance } from 'fastify';
import { initDb } from './db/database.js';
import { runMigrations } from './db/migrate.js';
import multipart from '@fastify/multipart';
import { subsonicPlugin } from './routes/subsonic/index.js';
import { apiPlugin } from './routes/api/index.js';
import { ensureAdminUser } from './auth/seed.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

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

  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(subsonicPlugin, { prefix: '/rest' });
  app.register(apiPlugin, { prefix: '/api/v1' });

  return app;
}
