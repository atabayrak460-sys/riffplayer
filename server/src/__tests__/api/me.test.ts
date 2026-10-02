import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb } from '../../db/database.js';
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

const auth = authParams(); // admin/admin

describe('GET /api/v1/users/me', () => {
  // Regression (#43): apiAuth used to fall through unconditionally to
  // subsonicAuth, which replies 200 with a Subsonic-shaped XML "missing
  // parameter" envelope on truly no credentials — a status/body a JSON
  // /api/v1 client can't interpret as an auth failure at all.
  it('returns a real 401 JSON error, not a 200 Subsonic-XML envelope, without credentials', async () => {
    const res = await app.inject({ url: '/api/v1/users/me' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns the current user with null preferences before any are set', async () => {
    const res = await app.inject({ url: `/api/v1/users/me?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { username: string; role: string; preferences: unknown };
    expect(body.username).toBe('admin');
    expect(body.role).toBe('admin');
    expect(body.preferences).toBeNull();
  });
});

describe('PATCH /api/v1/users/me/preferences', () => {
  it('creates a preferences row on first use and sets the given keys', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/preferences?${auth}`,
      payload: { transcode_format: 'opus', transcode_bitrate: 192 },
    });
    expect(res.statusCode).toBe(200);

    const me = await app.inject({ url: `/api/v1/users/me?${auth}` });
    const body = me.json() as { preferences: { transcode_format: string; transcode_bitrate: number } };
    expect(body.preferences.transcode_format).toBe('opus');
    expect(body.preferences.transcode_bitrate).toBe(192);
  });

  it('updates only the keys provided, leaving others unchanged', async () => {
    await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/preferences?${auth}`,
      payload: { transcode_format: 'opus', lastfm_session_key: 'abc123' },
    });
    await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/preferences?${auth}`,
      payload: { transcode_format: 'mp3' },
    });

    const me = await app.inject({ url: `/api/v1/users/me?${auth}` });
    const body = me.json() as { preferences: { transcode_format: string; lastfm_session_key: string } };
    expect(body.preferences.transcode_format).toBe('mp3');
    expect(body.preferences.lastfm_session_key).toBe('abc123'); // untouched by the second call
  });

  it('ignores keys that are not in the allowed preferences list', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/preferences?${auth}`,
      payload: { role: 'admin', not_a_real_pref: 'x' },
    });
    expect(res.statusCode).toBe(200); // silently ignored, not an error

    const me = await app.inject({ url: `/api/v1/users/me?${auth}` });
    const body = me.json() as { role: string };
    expect(body.role).toBe('admin'); // unchanged — role isn't a settable preference
  });

  it('returns 401 without credentials', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/preferences', payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/v1/users/me/password', () => {
  it('returns 401 without credentials', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/v1/users/me/password', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('requires both currentPassword and newPassword', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/password?${auth}`,
      payload: { currentPassword: 'admin' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an incorrect current password, leaving the real one unchanged', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/password?${auth}`,
      payload: { currentPassword: 'wrong-password', newPassword: 'newpass123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Current password is incorrect' });

    const stillWorks = await app.inject({ url: `/api/v1/users/me?${authParams('admin')}` });
    expect(stillWorks.statusCode).toBe(200);
  });

  it('changes the password — the old one stops authenticating, the new one works', async () => {
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/password?${auth}`,
      payload: { currentPassword: 'admin', newPassword: 'newpass123' },
    });
    expect(res.statusCode).toBe(200);

    // /api/v1/users/me falls back to Subsonic-style query auth for clients
    // without a JWT, which (per the Subsonic protocol, unlike apiAuth's own
    // no-credentials-at-all guard) always replies HTTP 200 with an error
    // code in the body on failure rather than a real 401.
    const oldPassword = await app.inject({ url: `/api/v1/users/me?${authParams('admin')}` });
    expect(oldPassword.statusCode).toBe(200);
    expect(oldPassword.json()).toMatchObject({ 'subsonic-response': { status: 'failed', error: { code: 40 } } });

    const newPassword = await app.inject({ url: `/api/v1/users/me?${authParams('newpass123')}` });
    expect(newPassword.statusCode).toBe(200);
    expect((newPassword.json() as { username: string }).username).toBe('admin');
  });

  it('invalidates JWTs issued before the change (token_version bump)', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'admin' },
    });
    const { token } = login.json() as { token: string };
    const beforeChange = await app.inject({ url: '/api/v1/users/me', headers: { Authorization: `Bearer ${token}` } });
    expect(beforeChange.statusCode).toBe(200);

    await app.inject({
      method: 'PATCH', url: `/api/v1/users/me/password?${auth}`,
      payload: { currentPassword: 'admin', newPassword: 'newpass123' },
    });

    const afterChange = await app.inject({ url: '/api/v1/users/me', headers: { Authorization: `Bearer ${token}` } });
    expect(afterChange.statusCode).toBe(401);
  });
});
