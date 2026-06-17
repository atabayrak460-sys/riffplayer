import { randomBytes } from 'crypto';
import type Database from 'better-sqlite3';
import { hashPassword, encryptPassword } from './crypto.js';

export function getOrCreateServerSecret(db: Database.Database): Buffer {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'server_secret'")
    .get() as { value: string } | undefined;
  if (row) return Buffer.from(row.value, 'hex');

  const secret = randomBytes(32);
  db.prepare("INSERT INTO settings (key, value) VALUES ('server_secret', ?)").run(
    secret.toString('hex'),
  );
  return secret;
}

export function ensureAdminUser(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }).n;
  if (count > 0) return;

  const username = process.env.CADENCE_ADMIN_USER ?? 'admin';
  const password = process.env.CADENCE_ADMIN_PASSWORD ?? 'admin';
  const secret = getOrCreateServerSecret(db);

  db.prepare(
    `INSERT INTO users (username, password_hash, subsonic_token, role)
     VALUES (?, ?, ?, 'admin')`,
  ).run(username, hashPassword(password), encryptPassword(password, secret));

  if (password === 'admin') {
    console.warn(
      '[seed] Created default admin user "admin" with password "admin". ' +
        'Change it via CADENCE_ADMIN_PASSWORD before exposing to the network.',
    );
  }
}
