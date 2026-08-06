import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { hashPassword } from '../../auth/crypto.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

describe('POST /api/v1/auth/login', () => {
  it('returns 400 when username is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { password: 'admin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'admin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for a username that does not exist', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'nobody', password: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for the wrong password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'admin', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns a usable JWT and user info for the correct password', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'admin', password: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { token: string; user: { id: number; username: string; role: string } };
    expect(body.user.username).toBe('admin');
    expect(body.user.role).toBe('admin');
    expect(typeof body.token).toBe('string');

    const whoami = await app.inject({
      method: 'GET', url: '/api/v1/users/me', headers: { authorization: `Bearer ${body.token}` },
    });
    expect(whoami.statusCode).toBe(200);
  });

  it('matches case-insensitively on username', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'ADMIN', password: 'admin' },
    });
    expect(res.statusCode).toBe(200);
  });

  // A user row with a password_hash but no subsonic_token (possible in principle —
  // the two are only ever set together by today's admin/users.ts, but the login
  // handler explicitly falls back to the bcrypt hash for exactly this case) must
  // still be able to log in via that fallback path.
  it('logs in via the bcrypt password_hash fallback when subsonic_token is not set', async () => {
    getDb().prepare(
      "INSERT INTO users (username, password_hash, subsonic_token, role) VALUES ('hashonly', ?, NULL, 'user')",
    ).run(hashPassword('correcthorse'));

    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { username: 'hashonly', password: 'correcthorse' },
    });
    expect(res.statusCode).toBe(200);
  });
});
