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

function regularUserToken(): string {
  const userId = Number(
    getDb().prepare("INSERT INTO users (username, password_hash, role) VALUES ('regular', 'x', 'user')").run()
      .lastInsertRowid,
  );
  return signToken({ id: userId, username: 'regular', role: 'user', token_version: 0 });
}

describe('GET /api/v1/admin/libraries', () => {
  it('returns 403 for a non-admin user', async () => {
    const token = regularUserToken();
    const res = await app.inject({ url: '/api/v1/admin/libraries', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('lists configured libraries with scanning: false when idle', async () => {
    getDb().prepare("INSERT INTO libraries (name, fs_path) VALUES ('Music', '/music')").run();
    const res = await app.inject({ url: `/api/v1/admin/libraries?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { libraries: { name: string; path: string; scanning: boolean }[] };
    expect(body.libraries).toEqual([{ id: expect.any(Number), name: 'Music', path: '/music', scanning: false }]);
  });
});

describe('POST /api/v1/admin/libraries', () => {
  it('returns 403 for a non-admin user', async () => {
    const token = regularUserToken();
    const res = await app.inject({
      method: 'POST', url: '/api/v1/admin/libraries', headers: { authorization: `Bearer ${token}` },
      payload: { name: 'X', path: '/x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a library', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/admin/libraries?${auth}`, payload: { name: 'Music', path: '/music' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: number; name: string; path: string };
    expect(body.name).toBe('Music');
    expect(body.path).toBe('/music');

    const row = getDb().prepare('SELECT name, fs_path FROM libraries WHERE id = ?').get(body.id);
    expect(row).toEqual({ name: 'Music', fs_path: '/music' });
  });

  it('returns 400 when name or path is missing', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/v1/admin/libraries?${auth}`, payload: { name: 'X' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/admin/libraries/:id', () => {
  it('returns 403 for a non-admin user', async () => {
    const token = regularUserToken();
    const libId = Number(
      getDb().prepare("INSERT INTO libraries (name, fs_path) VALUES ('Music', '/music')").run().lastInsertRowid,
    );
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/admin/libraries/${libId}`, headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('deletes a library', async () => {
    const libId = Number(
      getDb().prepare("INSERT INTO libraries (name, fs_path) VALUES ('Music', '/music')").run().lastInsertRowid,
    );
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/libraries/${libId}?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(getDb().prepare('SELECT id FROM libraries WHERE id = ?').get(libId)).toBeUndefined();
  });
});
