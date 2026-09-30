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
let playlistId: number;
let adminId: number;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'riffplayer-playlist-cover-'));
  process.env.COVERS_DIR = path.join(tmpDir, 'covers');
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();

  adminId = (getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  playlistId = Number(
    getDb().prepare('INSERT INTO playlists (owner_id, name) VALUES (?, ?)').run(adminId, 'Test Playlist').lastInsertRowid,
  );
});

afterEach(async () => {
  delete process.env.COVERS_DIR;
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams(); // admin/admin, seeded by migrations

describe('POST /api/v1/playlists/:id/cover', () => {
  it('uploads an image and it becomes visible via getCoverArt.view', async () => {
    const { body, contentType } = multipart('cover.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/playlists/${playlistId}/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = getDb().prepare('SELECT cover_path FROM playlists WHERE id = ?').get(playlistId) as {
      cover_path: string | null;
    };
    expect(row.cover_path).toBeTruthy();
    expect(existsSync(row.cover_path!)).toBe(true);

    const art = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=pl-${playlistId}` });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toMatch(/image\/png/);
  });

  it('returns 404 when the playlist is not owned by the requester', async () => {
    const otherUserId = Number(
      getDb().prepare("INSERT INTO users (username, password_hash) VALUES ('other', 'x')").run().lastInsertRowid,
    );
    const otherPlaylistId = Number(
      getDb().prepare('INSERT INTO playlists (owner_id, name) VALUES (?, ?)').run(otherUserId, 'Not Yours').lastInsertRowid,
    );

    const { body, contentType } = multipart('cover.png', 'image/png', TINY_PNG);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/playlists/${otherPlaylistId}/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/playlists/:id/cover (#20)', () => {
  it('clears cover_path, removes the file, and getCoverArt.view fails again', async () => {
    const { body, contentType } = multipart('cover.png', 'image/png', TINY_PNG);
    await app.inject({
      method: 'POST',
      url: `/api/v1/playlists/${playlistId}/cover?${auth}`,
      headers: { 'content-type': contentType },
      payload: body,
    });
    const coverPath = (
      getDb().prepare('SELECT cover_path FROM playlists WHERE id = ?').get(playlistId) as { cover_path: string }
    ).cover_path;
    expect(existsSync(coverPath)).toBe(true);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/playlists/${playlistId}/cover?${auth}` });
    expect(res.statusCode).toBe(200);

    const row = getDb().prepare('SELECT cover_path FROM playlists WHERE id = ?').get(playlistId) as {
      cover_path: string | null;
    };
    expect(row.cover_path).toBeNull();
    expect(existsSync(coverPath)).toBe(false);

    const art = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=pl-${playlistId}` });
    const artBody = JSON.parse(art.body)['subsonic-response'] as Record<string, unknown>;
    expect(artBody.status).toBe('failed');
  });

  it('is a no-op (still 200) when the playlist never had a cover', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/playlists/${playlistId}/cover?${auth}` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for a nonexistent playlist', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/playlists/99999/cover?${auth}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the playlist is not owned by the requester (not just any authenticated user)', async () => {
    const otherUserId = Number(
      getDb().prepare("INSERT INTO users (username, password_hash) VALUES ('other2', 'x')").run().lastInsertRowid,
    );
    const token = signToken({ id: otherUserId, username: 'other2', role: 'user', token_version: 0 });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/playlists/${playlistId}/cover`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
