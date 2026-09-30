import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ensureAdminUser } from '../../auth/seed.js';
import { verifyPasswordHash } from '../../auth/crypto.js';

let db: Database.Database;
const savedEnv = { ...process.env };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      subsonic_token TEXT,
      role TEXT NOT NULL
    );
  `);
});

afterEach(() => {
  db.close();
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

function adminRow() {
  return db.prepare('SELECT username, password_hash, role FROM users').get() as
    | { username: string; password_hash: string; role: string }
    | undefined;
}

describe('ensureAdminUser', () => {
  it('uses RIFFPLAYER_ADMIN_PASSWORD when set and does not log a password', () => {
    process.env.RIFFPLAYER_ADMIN_PASSWORD = 'chosen-by-admin';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ensureAdminUser(db);

    expect(verifyPasswordHash('chosen-by-admin', adminRow()!.password_hash)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('generates a random password (never "admin") when none is configured, and prints it once', () => {
    delete process.env.RIFFPLAYER_ADMIN_PASSWORD;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ensureAdminUser(db);

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    const generated = /generated password: (\S+)/.exec(logged)?.[1];
    expect(generated).toBeTruthy();
    expect(generated).not.toBe('admin');
    expect(generated!.length).toBeGreaterThanOrEqual(12);
    expect(verifyPasswordHash(generated!, adminRow()!.password_hash)).toBe(true);
    expect(verifyPasswordHash('admin', adminRow()!.password_hash)).toBe(false);
  });

  it('generates a different password for each fresh install', () => {
    delete process.env.RIFFPLAYER_ADMIN_PASSWORD;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ensureAdminUser(db);
    db.exec('DELETE FROM users');
    ensureAdminUser(db);

    const passwords = warn.mock.calls.map((c) => /generated password: (\S+)/.exec(String(c[0]))![1]);
    expect(passwords).toHaveLength(2);
    expect(passwords[0]).not.toBe(passwords[1]);
  });

  it('does nothing when a user already exists (existing installs are untouched)', () => {
    delete process.env.RIFFPLAYER_ADMIN_PASSWORD;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('old', 'x', 'admin')").run();

    ensureAdminUser(db);

    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 });
    expect(warn).not.toHaveBeenCalled();
  });
});
