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

describe('GET /api/v1/admin/settings', () => {
  it('returns 403 for a non-admin user', async () => {
    const token = regularUserToken();
    const res = await app.inject({ url: '/api/v1/admin/settings', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });

  it('returns settings as a key-value map, excluding the server/jwt secrets', async () => {
    getDb().prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_key', 'abc')").run();
    const res = await app.inject({ url: `/api/v1/admin/settings?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { settings: Record<string, string> };
    expect(body.settings.lastfm_api_key).toBe('abc');
    expect(body.settings.server_secret).toBeUndefined();
    expect(body.settings.jwt_secret).toBeUndefined();
  });
});

describe('PATCH /api/v1/admin/settings', () => {
  it('returns 403 for a non-admin user', async () => {
    const token = regularUserToken();
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/admin/settings', headers: { authorization: `Bearer ${token}` },
      payload: { ollama_url: 'http://x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('upserts a new key and updates an existing one', async () => {
    await app.inject({ method: 'PATCH', url: `/api/v1/admin/settings?${auth}`, payload: { ollama_url: 'http://a' } });
    await app.inject({ method: 'PATCH', url: `/api/v1/admin/settings?${auth}`, payload: { ollama_url: 'http://b' } });

    const row = getDb().prepare("SELECT value FROM settings WHERE key = 'ollama_url'").get() as { value: string };
    expect(row.value).toBe('http://b');
  });

  it('deletes a key when its value is explicitly null', async () => {
    await app.inject({ method: 'PATCH', url: `/api/v1/admin/settings?${auth}`, payload: { ollama_url: 'http://a' } });
    await app.inject({ method: 'PATCH', url: `/api/v1/admin/settings?${auth}`, payload: { ollama_url: null } });

    expect(getDb().prepare("SELECT value FROM settings WHERE key = 'ollama_url'").get()).toBeUndefined();
  });
});
