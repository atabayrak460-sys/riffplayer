import Database from 'better-sqlite3';

let instance: Database.Database | null = null;

export function initDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  instance = db;
  return db;
}

export function getDb(): Database.Database {
  if (!instance) throw new Error('DB not initialised — call initDb() first');
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
