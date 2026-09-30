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

  const username = process.env.RIFFPLAYER_ADMIN_USER ?? 'admin';
  // No shipped default: a well-known password on a server people expose to
  // the internet is a footgun. Generate one and print it once instead.
  const configured = process.env.RIFFPLAYER_ADMIN_PASSWORD;
  const password = configured ?? randomBytes(9).toString('base64url');
  const secret = getOrCreateServerSecret(db);

  db.prepare(
    `INSERT INTO users (username, password_hash, subsonic_token, role)
     VALUES (?, ?, ?, 'admin')`,
  ).run(username, hashPassword(password), encryptPassword(password, secret));

  if (!configured) {
    console.warn(
      `[seed] Created admin user "${username}" with a generated password: ${password}\n` +
        '[seed] Save it now — it is not shown again. Set RIFFPLAYER_ADMIN_PASSWORD to choose your own.',
    );
  }
}
