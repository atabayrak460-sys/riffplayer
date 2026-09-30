import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import {
  encryptPassword,
  decryptPassword,
  checkSubsonicToken,
  hashPassword,
  verifyPasswordHash,
  generateApiKey,
  hashApiKey,
} from '../../auth/crypto.js';

// ── unit: crypto helpers ───────────────────────────────────────────────────

describe('encryptPassword / decryptPassword', () => {
  const secret = randomBytes(32);

  it('round-trips plaintext', () => {
    const enc = encryptPassword('hunter2', secret);
    expect(decryptPassword(enc, secret)).toBe('hunter2');
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptPassword('hunter2', secret);
    const b = encryptPassword('hunter2', secret);
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptPassword('hunter2', secret);
    const buf = Buffer.from(enc, 'base64');
    buf[30] ^= 0xff; // flip a bit
    expect(() => decryptPassword(buf.toString('base64'), secret)).toThrow();
  });
});

describe('checkSubsonicToken', () => {
  it('accepts a correct token', () => {
    const password = 'sesame';
    const salt = 'abc123';
    const token = createHash('md5').update(password + salt).digest('hex');
    expect(checkSubsonicToken(password, token, salt)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(checkSubsonicToken('sesame', 'deadbeef'.repeat(4), 'salt')).toBe(false);
  });

  // Regression for #30: timingSafeEqual throws a RangeError on mismatched
  // buffer lengths, and `t=` is an unvalidated, attacker-controlled query
  // param — a short/long/empty token must return false, never throw.
  it('rejects a too-short token without throwing', () => {
    expect(() => checkSubsonicToken('sesame', 'short', 'abc123')).not.toThrow();
    expect(checkSubsonicToken('sesame', 'short', 'abc123')).toBe(false);
  });

  it('rejects a too-long token without throwing', () => {
    const overlong = 'a'.repeat(200);
    expect(() => checkSubsonicToken('sesame', overlong, 'abc123')).not.toThrow();
    expect(checkSubsonicToken('sesame', overlong, 'abc123')).toBe(false);
  });

  it('rejects an empty token without throwing', () => {
    expect(() => checkSubsonicToken('sesame', '', 'abc123')).not.toThrow();
    expect(checkSubsonicToken('sesame', '', 'abc123')).toBe(false);
  });
});

describe('hashPassword / verifyPasswordHash', () => {
  it('verifies the correct password', () => {
    const hash = hashPassword('correct');
    expect(verifyPasswordHash('correct', hash)).toBe(true);
  });

  it('rejects the wrong password', () => {
    const hash = hashPassword('correct');
    expect(verifyPasswordHash('wrong', hash)).toBe(false);
  });
});

// ── integration: auth preHandler via app.inject() ─────────────────────────

describe('Subsonic auth preHandler', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ dbPath: ':memory:' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  function makeToken(password: string, salt: string): string {
    return createHash('md5').update(password + salt).digest('hex');
  }

  it('ping does not require auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/rest/ping.view?f=json' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)['subsonic-response'].status).toBe('ok');
  });

  it('protected endpoint rejects request with no credentials', async () => {
    // getLicense is a protected endpoint (registered in the api scope)
    const res = await app.inject({ method: 'GET', url: '/rest/getLicense.view?f=json' });
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('failed');
    expect(body.error.code).toBe(10); // MISSING_PARAM
  });

  it('protected endpoint rejects wrong password', async () => {
    const salt = 'xyz';
    const res = await app.inject({
      method: 'GET',
      url: `/rest/getLicense.view?f=json&u=admin&t=${makeToken('wrong', salt)}&s=${salt}`,
    });
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('failed');
    expect(body.error.code).toBe(40); // WRONG_CREDENTIALS
  });

  // Regression for #30: a malformed t= (not 32 hex chars) used to crash the
  // request with a 500 instead of failing auth cleanly.
  it('protected endpoint rejects a malformed (non-32-char) token without crashing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/getLicense.view?f=json&u=admin&t=notarealtoken&s=xyz`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('failed');
    expect(body.error.code).toBe(40); // WRONG_CREDENTIALS, not a 500
  });

  it('protected endpoint accepts correct token auth', async () => {
    const password = process.env.RIFFPLAYER_ADMIN_PASSWORD ?? 'admin';
    const salt = 'testsalt';
    const token = makeToken(password, salt);
    const res = await app.inject({
      method: 'GET',
      url: `/rest/getLicense.view?f=json&u=admin&t=${token}&s=${salt}`,
    });
    // getLicense is now implemented — auth success returns status:'ok'
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('ok');
    expect((body.license as Record<string, unknown>).valid).toBe(true);
  });

  it('accepts OpenSubsonic API key auth', async () => {
    const db = getDb();
    const userId = (
      db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number }
    ).id;

    const apiKey = generateApiKey();
    db.prepare('INSERT INTO api_keys (user_id, key_hash, name) VALUES (?, ?, ?)').run(
      userId,
      hashApiKey(apiKey),
      'test-key',
    );

    const res = await app.inject({
      method: 'GET',
      url: `/rest/getLicense.view?f=json&u=admin&apiKey=${apiKey}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('ok'); // API key auth succeeded
  });

  // #2: BAD_API_VERSION_* existed as dead code — the server never validated `v`.
  it('rejects a client requesting a newer protocol version than the server supports', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/getLicense.view?f=json&u=admin&t=x&s=y&v=99.0.0`,
    });
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('failed');
    expect(body.error.code).toBe(30); // BAD_API_VERSION_SERVER
  });

  it('accepts an older protocol version from the client (backward compatible)', async () => {
    const password = process.env.RIFFPLAYER_ADMIN_PASSWORD ?? 'admin';
    const salt = 'testsalt';
    const token = makeToken(password, salt);
    const res = await app.inject({
      method: 'GET',
      url: `/rest/getLicense.view?f=json&u=admin&t=${token}&s=${salt}&v=1.0.0`,
    });
    const body = JSON.parse(res.body)['subsonic-response'];
    expect(body.status).toBe('ok');
  });
});
