import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/database.js';

export interface JwtPayload {
  sub: string;      // user id as string
  username: string;
  role: string;
}

function getJwtSecret(): string {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'jwt_secret'")
    .get() as { value: string } | undefined;
  if (row) return row.value;

  const secret = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)").run(secret);
  return secret;
}

export function signToken(user: { id: number; username: string; role: string }): string {
  return jwt.sign(
    { username: user.username, role: user.role },
    getJwtSecret(),
    { subject: String(user.id), expiresIn: '90d' },
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}
