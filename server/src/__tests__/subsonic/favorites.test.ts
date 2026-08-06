import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { seedLibrary, authParams } from './helpers.js';

let app: FastifyInstance;
let ids: ReturnType<typeof seedLibrary>;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  ids = seedLibrary(getDb());
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();
const sr = (body: string) =>
  (JSON.parse(body) as Record<string, Record<string, unknown>>)['subsonic-response'];

describe('star / unstar / getStarred2', () => {
  it('getStarred2 returns empty lists when nothing is starred', async () => {
    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.artist.length).toBe(0);
    expect(starred.album.length).toBe(0);
    expect(starred.song.length).toBe(0);
  });

  it('stars a track and it appears in getStarred2', async () => {
    await app.inject({ url: `/rest/star.view?${auth}&id=${ids.trackId}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const r = sr(res.body);
    expect(r.status).toBe('ok');
    const starred = r.starred2 as Record<string, unknown[]>;
    expect(starred.song.length).toBe(1);
  });

  it('unstars a track and it disappears from getStarred2', async () => {
    await app.inject({ url: `/rest/star.view?${auth}&id=${ids.trackId}` });
    await app.inject({ url: `/rest/unstar.view?${auth}&id=${ids.trackId}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.song.length).toBe(0);
  });

  it('stars an album and it appears in getStarred2', async () => {
    await app.inject({ url: `/rest/star.view?${auth}&albumId=${ids.albumId}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.album.length).toBe(1);
  });

  it('stars an artist and it appears in getStarred2', async () => {
    await app.inject({ url: `/rest/star.view?${auth}&artistId=${ids.artistId}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.artist.length).toBe(1);
  });

  it('unstars an artist and it disappears from getStarred2', async () => {
    await app.inject({ url: `/rest/star.view?${auth}&artistId=${ids.artistId}` });
    await app.inject({ url: `/rest/unstar.view?${auth}&artistId=${ids.artistId}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.artist.length).toBe(0);
  });

  it('stars multiple tracks in one request (repeated id)', async () => {
    const db = getDb();
    const trackId2 = Number(
      db.prepare('INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate) VALUES (?, ?, ?, 2, 200, ?, 1024, ?, 320)')
        .run('Test Track 2', ids.albumId, ids.artistId, '/music/test2.mp3', 'MPEG').lastInsertRowid,
    );

    await app.inject({ url: `/rest/star.view?${auth}&id=${ids.trackId}&id=${trackId2}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.song.length).toBe(2);
  });

  it('stars a mix of track, album, and artist ids in one request', async () => {
    await app.inject({
      url: `/rest/star.view?${auth}&id=${ids.trackId}&albumId=${ids.albumId}&artistId=${ids.artistId}`,
    });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.song.length).toBe(1);
    expect(starred.album.length).toBe(1);
    expect(starred.artist.length).toBe(1);
  });

  it('unstars multiple tracks in one request (repeated id)', async () => {
    const db = getDb();
    const trackId2 = Number(
      db.prepare('INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate) VALUES (?, ?, ?, 2, 200, ?, 1024, ?, 320)')
        .run('Test Track 2', ids.albumId, ids.artistId, '/music/test2.mp3', 'MPEG').lastInsertRowid,
    );
    await app.inject({ url: `/rest/star.view?${auth}&id=${ids.trackId}&id=${trackId2}` });

    await app.inject({ url: `/rest/unstar.view?${auth}&id=${ids.trackId}&id=${trackId2}` });

    const res = await app.inject({ url: `/rest/getStarred2.view?${auth}` });
    const starred = sr(res.body).starred2 as Record<string, unknown[]>;
    expect(starred.song.length).toBe(0);
  });

  it('returns MISSING_PARAM when no id is supplied to star.view', async () => {
    const res = await app.inject({ url: `/rest/star.view?${auth}` });
    const r = sr(res.body);
    expect(r.status).toBe('failed');
    expect((r.error as Record<string, unknown>).code).toBe(10);
  });

  it('returns MISSING_PARAM when no id is supplied to unstar.view', async () => {
    const res = await app.inject({ url: `/rest/unstar.view?${auth}` });
    const r = sr(res.body);
    expect(r.status).toBe('failed');
    expect((r.error as Record<string, unknown>).code).toBe(10);
  });
});
