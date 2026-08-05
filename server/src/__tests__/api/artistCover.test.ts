import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { signToken } from '../../auth/jwt.js';
import { authParams } from '../subsonic/helpers.js';

// Minimal 1×1 red PNG
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '77533d0000000c4944415408d7636068f8cf0000000200019e221bc60000' +
  '00004945444ae426082',
  'hex',
);

function multipart(filename: string, mimeType: string, data: Buffer): { body: Buffer; contentType: string } {
  const boundary = '----cadenceTestBoundary';
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
let artistId: number;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cadence-artist-cover-'));
  process.env.COVERS_DIR = path.join(tmpDir, 'covers');
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();

  artistId = Number(
    getDb().prepare("INSERT INTO artists (name) VALUES ('Test Artist')").run().lastInsertRowid,
  );
});

afterEach(async () => {
  delete process.env.COVERS_DIR;
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams(); // admin/admin, seeded by migrations

describe('POST /api/v1/artists/:id/cover', () => {
  it('uploads an image and it becomes visible via getCoverArt.view', async () => {
    const { body, contentType } = multipart('artist.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artists/${artistId}/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = getDb().prepare('SELECT image_path FROM artists WHERE id = ?').get(artistId) as {
      image_path: string | null;
    };
    expect(row.image_path).toBeTruthy();
    expect(existsSync(row.image_path!)).toBe(true);

    const art = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=ar-${artistId}` });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toMatch(/image\/png/);
  });

  it('rejects unsupported mime types', async () => {
    const { body, contentType } = multipart('notes.txt', 'text/plain', Buffer.from('hello'));
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artists/${artistId}/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    const row = getDb().prepare('SELECT image_path FROM artists WHERE id = ?').get(artistId) as {
      image_path: string | null;
    };
    expect(row.image_path).toBeNull();
  });

  it('returns 404 for a nonexistent artist', async () => {
    const { body, contentType } = multipart('artist.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artists/99999/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects non-admin users', async () => {
    const userId = Number(
      getDb()
        .prepare("INSERT INTO users (username, password_hash, role) VALUES ('regular', 'x', 'user')")
        .run().lastInsertRowid,
    );
    const token = signToken({ id: userId, username: 'regular', role: 'user', token_version: 0 });

    const { body, contentType } = multipart('artist.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artists/${artistId}/cover`,
      headers: { 'content-type': contentType, authorization: `Bearer ${token}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });

  it('replacing with a different image type removes the old file from disk', async () => {
    const png = multipart('artist.png', 'image/png', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/artists/${artistId}/cover?${auth}`,
      headers: { 'content-type': png.contentType },
      payload: png.body,
    });
    const firstPath = (
      getDb().prepare('SELECT image_path FROM artists WHERE id = ?').get(artistId) as { image_path: string }
    ).image_path;
    expect(existsSync(firstPath)).toBe(true);

    const jpeg = multipart('artist.jpg', 'image/jpeg', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/artists/${artistId}/cover?${auth}`,
      headers: { 'content-type': jpeg.contentType },
      payload: jpeg.body,
    });
    const secondPath = (
      getDb().prepare('SELECT image_path FROM artists WHERE id = ?').get(artistId) as { image_path: string }
    ).image_path;

    expect(secondPath).not.toBe(firstPath);
    expect(existsSync(firstPath)).toBe(false);
    expect(existsSync(secondPath)).toBe(true);
  });
});

describe('DELETE /api/v1/artists/:id/cover', () => {
  it('clears image_path, removes the file, and getCoverArt.view 404s again', async () => {
    const { body, contentType } = multipart('artist.png', 'image/png', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/artists/${artistId}/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    const imagePath = (
      getDb().prepare('SELECT image_path FROM artists WHERE id = ?').get(artistId) as { image_path: string }
    ).image_path;
    expect(existsSync(imagePath)).toBe(true);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/artists/${artistId}/cover?${auth}` });
    expect(res.statusCode).toBe(200);

    const row = getDb().prepare('SELECT image_path FROM artists WHERE id = ?').get(artistId) as {
      image_path: string | null;
    };
    expect(row.image_path).toBeNull();
    expect(existsSync(imagePath)).toBe(false);

    const art = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=ar-${artistId}` });
    const artBody = JSON.parse(art.body)['subsonic-response'] as Record<string, unknown>;
    expect(artBody.status).toBe('failed');
  });

  it('returns 404 for a nonexistent artist', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/artists/99999/cover?${auth}` });
    expect(res.statusCode).toBe(404);
  });

  it('rejects non-admin users', async () => {
    const userId = Number(
      getDb()
        .prepare("INSERT INTO users (username, password_hash, role) VALUES ('regular2', 'x', 'user')")
        .run().lastInsertRowid,
    );
    const token = signToken({ id: userId, username: 'regular2', role: 'user', token_version: 0 });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/artists/${artistId}/cover`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
