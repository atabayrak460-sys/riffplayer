import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { seedLibrary, authParams } from './helpers.js';

let app: FastifyInstance;
let ids: ReturnType<typeof seedLibrary>;
let trackId2: number;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  ids = seedLibrary(getDb());
  trackId2 = Number(
    getDb()
      .prepare(`
        INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
        VALUES ('Test Track 2', ?, ?, 2, 200, '/music/test2.mp3', 1024000, 'MPEG', 320)
      `)
      .run(ids.albumId, ids.artistId).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();

function sr(body: string) {
  return (JSON.parse(body) as Record<string, Record<string, unknown>>)['subsonic-response'];
}

describe('getPlayQueue', () => {
  it('returns a bare ok with no playQueue element when nothing has been saved', async () => {
    const res = await app.inject({ url: `/rest/getPlayQueue.view?${auth}` });
    const r = sr(res.body);
    expect(r.status).toBe('ok');
    expect(r.playQueue).toBeUndefined();
  });
});

describe('savePlayQueue / getPlayQueue round-trip', () => {
  it('saves and retrieves a queue, preserving order and metadata', async () => {
    const saveRes = await app.inject({
      url: `/rest/savePlayQueue.view?${auth}&id=${trackId2}&id=${ids.trackId}&current=${ids.trackId}&position=4200`,
    });
    expect(sr(saveRes.body).status).toBe('ok');

    const getRes = await app.inject({ url: `/rest/getPlayQueue.view?${auth}` });
    const r = sr(getRes.body);
    expect(r.status).toBe('ok');
    const pq = r.playQueue as Record<string, unknown>;
    expect(pq.current).toBe(String(ids.trackId));
    expect(pq.position).toBe(4200);
    expect(pq.username).toBe('admin');
    expect(pq.changedBy).toBe('test'); // c=test, from authParams
    expect(typeof pq.changed).toBe('string');

    const entries = pq.entry as Record<string, unknown>[];
    // Order in the response must match the order saved (t.id IN (...) alone wouldn't guarantee this).
    expect(entries.map((e) => e.id)).toEqual([String(trackId2), String(ids.trackId)]);
  });

  it('a later save overwrites the previous queue for the same user', async () => {
    await app.inject({ url: `/rest/savePlayQueue.view?${auth}&id=${ids.trackId}&current=${ids.trackId}` });
    await app.inject({ url: `/rest/savePlayQueue.view?${auth}&id=${trackId2}&current=${trackId2}` });

    const res = await app.inject({ url: `/rest/getPlayQueue.view?${auth}` });
    const pq = sr(res.body).playQueue as Record<string, unknown>;
    expect(pq.current).toBe(String(trackId2));
    expect((pq.entry as unknown[]).length).toBe(1);
  });

  it('silently drops an id that no longer exists in the library', async () => {
    await app.inject({ url: `/rest/savePlayQueue.view?${auth}&id=${ids.trackId}&id=999999` });

    const res = await app.inject({ url: `/rest/getPlayQueue.view?${auth}` });
    const pq = sr(res.body).playQueue as Record<string, unknown>;
    expect((pq.entry as Record<string, unknown>[]).map((e) => e.id)).toEqual([String(ids.trackId)]);
  });

  it('defaults position to 0 when omitted', async () => {
    await app.inject({ url: `/rest/savePlayQueue.view?${auth}&id=${ids.trackId}` });

    const res = await app.inject({ url: `/rest/getPlayQueue.view?${auth}` });
    const pq = sr(res.body).playQueue as Record<string, unknown>;
    expect(pq.position).toBe(0);
  });
});
