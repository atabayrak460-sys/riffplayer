import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from './helpers.js';

// Minimal valid WAV (44-byte header, 0 samples, 44100 Hz mono 16-bit PCM)
function writeWav(p: string): void {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36, 4);
  b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);  b.writeUInt16LE(1, 20);  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);   b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(0, 40);
  writeFileSync(p, b);
}

let app: FastifyInstance;
let tmpDir: string;
let trackId: number;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();

  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cadence-stream-'));
  const wavPath = path.join(tmpDir, 'test.wav');
  writeWav(wavPath);

  const db = getDb();
  const artistId = Number(db.prepare("INSERT INTO artists (name) VALUES ('Artist')").run().lastInsertRowid);
  const albumId  = Number(db.prepare("INSERT INTO albums (name, artist_id) VALUES ('Album', ?)").run(artistId).lastInsertRowid);
  trackId = Number(
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, path, size, format)
      VALUES ('Track', ?, ?, ?, 44, 'WAVE')
    `).run(albumId, artistId, wavPath).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams();

describe('stream.view', () => {
  it('returns 200 with correct content-type for a WAV file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/wav/);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.rawPayload.length).toBe(44);
  });

  it('returns 206 Partial Content for a range request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=0-9' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-9\/44$/);
    expect(res.headers['content-length']).toBe('10');
    expect(res.rawPayload.length).toBe(10);
  });

  it('returns the correct byte slice for a mid-file range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=10-19' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-length']).toBe('10');
  });

  it('handles open-ended range (bytes=N-)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=40-' },
    });
    expect(res.statusCode).toBe(206);
    expect(Number(res.headers['content-length'])).toBe(4); // bytes 40-43
  });

  it('returns Subsonic error for unknown track', async () => {
    const res = await app.inject({ url: `/rest/stream.view?${auth}&id=99999` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });

  it('returns Subsonic error when file is missing from disk', async () => {
    getDb().prepare('UPDATE tracks SET path = ? WHERE id = ?').run('/nonexistent/file.wav', trackId);
    const res = await app.inject({ url: `/rest/stream.view?${auth}&id=${trackId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });
});

describe('download.view', () => {
  it('serves the file with Content-Disposition attachment', async () => {
    const res = await app.inject({
      url: `/rest/download.view?${auth}&id=${trackId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/test\.wav/);
    expect(res.rawPayload.length).toBe(44);
  });

  it('supports range requests on download too', async () => {
    const res = await app.inject({
      url: `/rest/download.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=0-3' },
    });
    expect(res.statusCode).toBe(206);
  });
});
