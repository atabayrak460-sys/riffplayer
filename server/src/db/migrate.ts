import { readdir, readFile } from 'fs/promises';
import path from 'path';
import type Database from 'better-sqlite3';

export async function runMigrations(db: Database.Database, migrationsDir: string): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]).map(
      (r) => r.version,
    ),
  );

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const insert = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');

  for (const file of files) {
    const version = path.basename(file, '.sql');
    if (applied.has(version)) continue;

    const sql = await readFile(path.join(migrationsDir, file), 'utf-8');

    db.transaction(() => {
      db.exec(sql);
      insert.run(version);
    })();
  }
}
