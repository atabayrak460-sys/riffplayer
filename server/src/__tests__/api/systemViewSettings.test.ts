import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from '../subsonic/helpers.js';

// Minimal 1×1 red PNG
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '77533d0000000c4944415408d7636068f8cf0000000200019e221bc60000' +
  '00004945444ae426082',
  'hex',
);

function multipart(filename: string, mimeType: string, data: Buffer): { body: Buffer; contentType: string } {
  const boundary = '----riffplayerTestBoundary';
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([preamble, data, epilogue]), contentType: `multipart/form-data; boundary=${boundary}` };
}

let app: FastifyInstance;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'riffplayer-system-view-'));
  process.env.COVERS_DIR = path.join(tmpDir, 'covers');
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  delete process.env.COVERS_DIR;
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams(); // admin/admin, seeded by migrations

describe('GET /api/v1/system-views/:key', () => {
  it('returns defaults (no cover, no description) for an untouched view', async () => {
    const res = await app.inject({ url: `/api/v1/system-views/most-played?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hasCover: false, description: null });
  });

  it('returns 404 for an unknown view key', async () => {
    const res = await app.inject({ url: `/api/v1/system-views/not-a-real-view?${auth}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/v1/system-views/:key/description', () => {
  it('sets a custom description, reflected in the GET response', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/system-views/favorites/description?${auth}`,
      headers: { 'content-type': 'application/json' },
      payload: { description: 'My favourite jams' },
    });
    expect(res.statusCode).toBe(200);

    const get = await app.inject({ url: `/api/v1/system-views/favorites?${auth}` });
    expect(get.json()).toEqual({ hasCover: false, description: 'My favourite jams' });
  });

  it('clears the override when given an empty/whitespace description', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/v1/system-views/discover/description?${auth}`,
      headers: { 'content-type': 'application/json' },
      payload: { description: 'Custom text' },
    });
    const clear = await app.inject({
      method: 'PUT',
      url: `/api/v1/system-views/discover/description?${auth}`,
      headers: { 'content-type': 'application/json' },
      payload: { description: '   ' },
    });
    expect(clear.statusCode).toBe(200);

    const get = await app.inject({ url: `/api/v1/system-views/discover?${auth}` });
    expect(get.json()).toEqual({ hasCover: false, description: null });
  });

  it('returns 404 for an unknown view key', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/system-views/bogus/description?${auth}`,
      headers: { 'content-type': 'application/json' },
      payload: { description: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/system-views/:key/cover', () => {
  it('uploads an image and it becomes visible via getCoverArt.view (sv- id)', async () => {
    const { body, contentType } = multipart('cover.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/system-views/wrapped/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = getDb()
      .prepare("SELECT cover_path FROM system_view_settings WHERE user_id = 1 AND view_key = 'wrapped'")
      .get() as { cover_path: string | null };
    expect(row.cover_path).toBeTruthy();
    expect(existsSync(row.cover_path!)).toBe(true);

    const art = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=sv-wrapped` });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toMatch(/image\/png/);

    const get = await app.inject({ url: `/api/v1/system-views/wrapped?${auth}` });
    expect(get.json().hasCover).toBe(true);
  });

  it('rejects unsupported mime types', async () => {
    const { body, contentType } = multipart('notes.txt', 'text/plain', Buffer.from('hello'));
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/system-views/wrapped/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for an unknown view key', async () => {
    const { body, contentType } = multipart('cover.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/system-views/bogus/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it('replacing with a different image type removes the old file from disk', async () => {
    const png = multipart('cover.png', 'image/png', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/system-views/discover/cover?${auth}`,
      headers: { 'content-type': png.contentType },
      payload: png.body,
    });
    const firstPath = (
      getDb().prepare("SELECT cover_path FROM system_view_settings WHERE user_id = 1 AND view_key = 'discover'")
        .get() as { cover_path: string }
    ).cover_path;
    expect(existsSync(firstPath)).toBe(true);

    const jpeg = multipart('cover.jpg', 'image/jpeg', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/system-views/discover/cover?${auth}`,
      headers: { 'content-type': jpeg.contentType },
      payload: jpeg.body,
    });
    const secondPath = (
      getDb().prepare("SELECT cover_path FROM system_view_settings WHERE user_id = 1 AND view_key = 'discover'")
        .get() as { cover_path: string }
    ).cover_path;

    expect(secondPath).not.toBe(firstPath);
    expect(existsSync(firstPath)).toBe(false);
    expect(existsSync(secondPath)).toBe(true);
  });
});

describe('DELETE /api/v1/system-views/:key/cover', () => {
  it('clears cover_path, removes the file, and getCoverArt.view 404s again', async () => {
    const { body, contentType } = multipart('cover.png', 'image/png', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/system-views/most-played/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    const coverPath = (
      getDb().prepare("SELECT cover_path FROM system_view_settings WHERE user_id = 1 AND view_key = 'most-played'")
        .get() as { cover_path: string }
    ).cover_path;
    expect(existsSync(coverPath)).toBe(true);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/system-views/most-played/cover?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(existsSync(coverPath)).toBe(false);

    const get = await app.inject({ url: `/api/v1/system-views/most-played?${auth}` });
    expect(get.json()).toEqual({ hasCover: false, description: null });

    const art = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=sv-most-played` });
    const artBody = JSON.parse(art.body)['subsonic-response'] as Record<string, unknown>;
    expect(artBody.status).toBe('failed');
  });

  it('returns 404 for an unknown view key', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/system-views/bogus/cover?${auth}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('getCoverArt.view — sv- id without auth context', () => {
  it('returns DATA_NOT_FOUND when unauthenticated', async () => {
    const res = await app.inject({ url: '/rest/getCoverArt.view?f=json&id=sv-wrapped' });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
  });
});
