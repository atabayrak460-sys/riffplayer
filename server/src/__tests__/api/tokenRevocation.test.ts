import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from '../subsonic/helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const adminAuth = authParams(); // admin/admin, seeded by migrations

describe('JWT revocation on password change', () => {
  it('rejects a JWT issued before a password change', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'admin' },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json() as { token: string };
    const { id: adminId } = getDb()
      .prepare("SELECT id FROM users WHERE username = 'admin'")
      .get() as { id: number };

    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(before.statusCode).toBe(200);

    const change = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${adminId}?${adminAuth}`,
      payload: { password: 'newpassword' },
    });
    expect(change.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(401);
    expect(after.json()).toEqual({ error: 'Token has been revoked' });
  });

  it('accepts a JWT issued after the password change', async () => {
    const { id: adminId } = getDb()
      .prepare("SELECT id FROM users WHERE username = 'admin'")
      .get() as { id: number };

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${adminId}?${adminAuth}`,
      payload: { password: 'newpassword' },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'newpassword' },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json() as { token: string };

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
