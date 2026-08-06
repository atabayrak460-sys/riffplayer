import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { closeDb } from '../db/database.js';
import { authParams } from './subsonic/helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

describe('security headers (#19)', () => {
  it('sets baseline hardening headers on a normal response', async () => {
    const res = await app.inject({ url: '/rest/ping.view?f=json' });
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not set a Content-Security-Policy header (deliberately disabled)', async () => {
    const res = await app.inject({ url: '/rest/ping.view?f=json' });
    // CSP is off — the SPA has no nonce/hash setup for its bundled scripts,
    // helmet's default CSP would break it outright.
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('does not set Strict-Transport-Security (deliberately disabled)', async () => {
    const res = await app.inject({ url: '/rest/ping.view?f=json' });
    // Self-hosters commonly run this behind plain HTTP or a reverse proxy
    // that terminates TLS itself — sending HSTS here would make browsers
    // refuse to reconnect over HTTP for up to a year. That's the reverse
    // proxy's call to make, not this app's.
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('CORS (#19)', () => {
  it('does not reflect a cross-origin Origin back — no Access-Control-Allow-Origin header', async () => {
    const res = await app.inject({
      url: '/rest/ping.view?f=json',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a cross-origin preflight request', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/login',
      headers: {
        origin: 'https://evil.example.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('same-origin requests (no Origin header, as sent by non-browser Subsonic clients) are unaffected', async () => {
    const auth = authParams();
    const res = await app.inject({ url: `/rest/getLicense.view?f=json&${auth}` });
    expect(res.statusCode).toBe(200);
  });
});

describe('rate limiting on /api/v1/auth/login (#19)', () => {
  it('allows up to the configured limit, then returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'admin', password: 'wrong' },
      });
      expect(res.statusCode).toBe(401); // wrong password, but not yet rate-limited
    }

    const sixth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'wrong' },
    });
    expect(sixth.statusCode).toBe(429);
  });

  it('does not rate-limit unrelated endpoints after exhausting the login limit', async () => {
    for (let i = 0; i < 6; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'admin', password: 'wrong' },
      });
    }

    const res = await app.inject({ url: '/rest/ping.view?f=json' });
    expect(res.statusCode).toBe(200);
  });
});
