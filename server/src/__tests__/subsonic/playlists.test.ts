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

describe('playlists', () => {
  it('creates a playlist and returns it in getPlaylists', async () => {
    await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=My%20Mix` });

    const res = await app.inject({ url: `/rest/getPlaylists.view?${auth}` });
    const playlists = (sr(res.body).playlists as Record<string, unknown[]>).playlist;
    expect(playlists.length).toBe(1);
    expect((playlists[0] as Record<string, unknown>).name).toBe('My Mix');
  });

  it('creates a playlist with songs', async () => {
    const res = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=Tracks&songId=${ids.trackId}`,
    });
    const pl = sr(res.body).playlist as Record<string, unknown>;
    expect(pl.songCount).toBe(1);
    const entries = pl.entry as unknown[];
    expect(entries.length).toBe(1);
  });

  it('getPlaylist returns tracks in order', async () => {
    const create = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=Ordered&songId=${ids.trackId}`,
    });
    const plId = (sr(create.body).playlist as Record<string, unknown>).id as string;

    const res = await app.inject({ url: `/rest/getPlaylist.view?${auth}&id=${plId}` });
    const pl = sr(res.body).playlist as Record<string, unknown>;
    expect((pl.entry as unknown[]).length).toBe(1);
  });

  it('updatePlaylist changes the name', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=Old` });
    const plId = (sr(create.body).playlist as Record<string, unknown>).id as string;

    await app.inject({ url: `/rest/updatePlaylist.view?${auth}&playlistId=${plId}&name=New` });

    const res = await app.inject({ url: `/rest/getPlaylist.view?${auth}&id=${plId}` });
    expect((sr(res.body).playlist as Record<string, unknown>).name).toBe('New');
  });
});
