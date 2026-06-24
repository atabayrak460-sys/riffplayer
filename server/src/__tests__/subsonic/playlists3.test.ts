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

describe('deletePlaylist.view', () => {
  it('deletes an owned playlist', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=ToDelete` });
    const plId = (sr(create.body).playlist as Record<string, unknown>).id as string;

    const del = await app.inject({ url: `/rest/deletePlaylist.view?${auth}&id=${plId}` });
    expect(sr(del.body).status).toBe('ok');

    const list = await app.inject({ url: `/rest/getPlaylists.view?${auth}` });
    const playlists = (sr(list.body).playlists as Record<string, unknown[]>).playlist;
    expect(playlists.length).toBe(0);
  });

  it('returns MISSING_PARAM when id absent', async () => {
    const res = await app.inject({ url: `/rest/deletePlaylist.view?${auth}` });
    expect((sr(res.body).error as Record<string, unknown>).code).toBe(10);
  });

  it('returns DATA_NOT_FOUND for unknown playlist', async () => {
    const res = await app.inject({ url: `/rest/deletePlaylist.view?${auth}&id=99999` });
    expect((sr(res.body).error as Record<string, unknown>).code).toBe(70);
  });
});

describe('PUT /api/v1/playlists/:id/tracks', () => {
  it('reorders tracks in the playlist', async () => {
    // create 2nd track to have two
    const db = getDb();
    const trackId2 = Number(
      db.prepare('INSERT INTO tracks (title, album_id, artist_id, path) VALUES (?, ?, ?, ?)')
        .run('Track2', ids.albumId, ids.artistId, '/music/track2.mp3').lastInsertRowid,
    );

    const create = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=ReorderMe&songId=${ids.trackId}&songId=${trackId2}`,
    });
    const plId = (sr(create.body).playlist as Record<string, unknown>).id as string;

    // Reverse order: trackId2, then trackId
    const put = await app.inject({
      method: 'PUT',
      url: `/api/v1/playlists/${plId}/tracks?${auth}`,
      payload: { trackIds: [String(trackId2), String(ids.trackId)] },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).ok).toBe(true);

    const list = await app.inject({ url: `/rest/getPlaylist.view?${auth}&id=${plId}` });
    const pl = sr(list.body).playlist as Record<string, unknown>;
    const entries = pl.entry as Array<Record<string, unknown>>;
    expect(entries[0].id).toBe(String(trackId2));
    expect(entries[1].id).toBe(String(ids.trackId));
  });
});
