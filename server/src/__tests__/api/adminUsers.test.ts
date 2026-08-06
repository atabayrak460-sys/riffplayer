import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from '../subsonic/helpers.js';
import { signToken } from '../../auth/jwt.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams(); // admin/admin

function regularUserToken(): { userId: number; token: string } {
  const userId = Number(
    getDb().prepare("INSERT INTO users (username, password_hash, role) VALUES ('regular', 'x', 'user')").run()
      .lastInsertRowid,
  );
  return { userId, token: signToken({ id: userId, username: 'regular', role: 'user', token_version: 0 }) };
}

describe('GET /api/v1/admin/users', () => {
  it('returns 403 for a non-admin user', async () => {
    const { token } = regularUserToken();
    const res = await app.inject({ url: '/api/v1/admin/users', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without credentials', async () => {
    const res = await app.inject({ url: '/api/v1/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('lists all users for an admin', async () => {
    regularUserToken();
    const res = await app.inject({ url: `/api/v1/admin/users?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { users: { username: string }[] };
    expect(body.users.map((u) => u.username).sort()).toEqual(['admin', 'regular']);
  });
});

describe('POST /api/v1/admin/users', () => {
  it('returns 403 for a non-admin user', async () => {
    const { token } = regularUserToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/users', headers: { authorization: `Bearer ${token}` },
      payload: { username: 'new', password: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a user with the default role of "user"', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/users?${auth}`, payload: { username: 'newuser', password: 'x' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; username: string; role: string };
    expect(body.username).toBe('newuser');
    expect(body.role).toBe('user');
  });

  it('creates a user with an explicit admin role', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/users?${auth}`,
      payload: { username: 'newadmin', password: 'x', role: 'admin' },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { role: string }).role).toBe('admin');
  });

  it('returns 400 when username or password is missing', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/users?${auth}`, payload: { username: 'x' } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid role', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/users?${auth}`,
      payload: { username: 'x', password: 'x', role: 'superuser' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 for a duplicate username', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/users?${auth}`, payload: { username: 'admin', password: 'x' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('PATCH /api/v1/admin/users/:id', () => {
  it('returns 403 for a non-admin user', async () => {
    const { userId, token } = regularUserToken();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/admin/users/${userId}`, headers: { authorization: `Bearer ${token}` },
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('updates the role', async () => {
    const { userId } = regularUserToken();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/admin/users/${userId}?${auth}`, payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    const row = getDb().prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string };
    expect(row.role).toBe('admin');
  });

  it('returns 400 for an invalid role', async () => {
    const { userId } = regularUserToken();
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/admin/users/${userId}?${auth}`, payload: { role: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('changing the password bumps token_version, revoking previously-issued JWTs', async () => {
    const { userId, token } = regularUserToken();

    const before = await app.inject({ url: '/api/v1/users/me', headers: { authorization: `Bearer ${token}` } });
    expect(before.statusCode).toBe(200);

    await app.inject({ method: 'PATCH', url: `/api/v1/admin/users/${userId}?${auth}`, payload: { password: 'newpw' } });

    const after = await app.inject({ url: '/api/v1/users/me', headers: { authorization: `Bearer ${token}` } });
    expect(after.statusCode).toBe(401);
  });
});

describe('DELETE /api/v1/admin/users/:id', () => {
  it('returns 403 for a non-admin user', async () => {
    const { userId, token } = regularUserToken();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/admin/users/${userId}`, headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('deletes another user', async () => {
    const { userId } = regularUserToken();
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${userId}?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(getDb().prepare('SELECT id FROM users WHERE id = ?').get(userId)).toBeUndefined();
  });

  it('returns 400 when an admin tries to delete their own account', async () => {
    const { id: adminId } = getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number };
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/users/${adminId}?${auth}` });
    expect(res.statusCode).toBe(400);
    expect(getDb().prepare('SELECT id FROM users WHERE id = ?').get(adminId)).toBeDefined();
  });
});
