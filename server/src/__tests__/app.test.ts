import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';
import { closeDb, getDb } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';

describe('buildApp', () => {
  it('starts with an in-memory DB and runs migrations', async () => {
    const app = await buildApp({ dbPath: ':memory:' });
    expect(app).toBeDefined();

    const tables = getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain('users');
    expect(names).toContain('tracks');
    expect(names).toContain('play_history');
    expect(names).toContain('schema_migrations');

    await app.close();
    closeDb();
  });

  it('migrations are idempotent — running twice does not throw', async () => {
    const app = await buildApp({ dbPath: ':memory:' });
    const db = getDb();

    const migrationsDir = new URL('../../migrations', import.meta.url).pathname;
    await expect(runMigrations(db, migrationsDir)).resolves.toBeUndefined();

    await app.close();
    closeDb();
  });
});
