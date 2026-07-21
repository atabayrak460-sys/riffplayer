import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams, seedLibrary } from '../subsonic/helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();

describe('GET /api/v1/library/stats', () => {
  it('returns 0 when the library is empty', async () => {
    const res = await app.inject({ url: `/api/v1/library/stats?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ trackCount: 0 });
  });

  it('returns the total track count across all albums/artists', async () => {
    const db = getDb();
    const { albumId, artistId } = seedLibrary(db);
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
      VALUES ('Track 2', ?, ?, 2, 180, '/music/t2.mp3', 900000, 'MPEG', 320)
    `).run(albumId, artistId);

    const res = await app.inject({ url: `/api/v1/library/stats?${auth}` });
    expect(JSON.parse(res.body)).toEqual({ trackCount: 2 });
  });
});
