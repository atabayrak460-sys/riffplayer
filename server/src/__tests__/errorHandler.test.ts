import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { closeDb } from '../db/database.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });

  // Routes that always throw, registered directly (bypassing the real
  // subsonic/api plugins) so these tests exercise exactly the global
  // setErrorHandler fallback, not any handler-local try/catch.
  app.get('/rest/throws.view', async () => {
    throw new Error('boom');
  });
  app.get('/api/v1/throws', async () => {
    throw new Error('boom');
  });
  app.get('/api/v1/throws-with-status', async () => {
    const err = new Error('bad input') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  });

  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

describe('global error handler — /rest/* (Subsonic-shaped)', () => {
  it('returns a Subsonic-shaped JSON error (status 200, GENERIC code) instead of a bare Fastify error', async () => {
    const res = await app.inject({ url: '/rest/throws.view?f=json' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(0);
    // Never leak the raw exception message to the client.
    expect((body.error as Record<string, unknown>).message).not.toMatch(/boom/);
  });

  it('returns a Subsonic-shaped XML error when no f=json is given', async () => {
    const res = await app.inject({ url: '/rest/throws.view' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/xml/);
    expect(res.body).toContain('status="failed"');
    expect(res.body).toContain('code="0"');
  });
});

describe('global error handler — /api/* (plain JSON)', () => {
  it('returns a 500 JSON error for an uncaught exception with no statusCode set', async () => {
    const res = await app.inject({ url: '/api/v1/throws' });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: 'boom' });
  });

  it('preserves a meaningful statusCode set on the thrown error', async () => {
    const res = await app.inject({ url: '/api/v1/throws-with-status' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'bad input' });
  });
});
