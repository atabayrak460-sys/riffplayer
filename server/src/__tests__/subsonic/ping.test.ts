import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb } from '../../db/database.js';
import { SUBSONIC_API_VERSION } from '../../routes/subsonic/response.js';

describe('GET /rest/ping.view', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ dbPath: ':memory:' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it('returns XML with status ok by default', async () => {
    const res = await app.inject({ method: 'GET', url: '/rest/ping.view' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.body).toContain('status="ok"');
    expect(res.body).toContain(`version="${SUBSONIC_API_VERSION}"`);
    expect(res.body).toContain('type="cadence"');
  });

  it('returns JSON with status ok when f=json', async () => {
    const res = await app.inject({ method: 'GET', url: '/rest/ping.view?f=json' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    const body = JSON.parse(res.body) as Record<string, Record<string, unknown>>;
    const sr = body['subsonic-response'];
    expect(sr.status).toBe('ok');
    expect(sr.version).toBe(SUBSONIC_API_VERSION);
    expect(sr.type).toBe('cadence');
  });

  it('also works via POST', async () => {
    const res = await app.inject({ method: 'POST', url: '/rest/ping.view?f=json' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, Record<string, unknown>>;
    expect(body['subsonic-response'].status).toBe('ok');
  });
});
