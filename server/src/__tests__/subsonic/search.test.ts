import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { seedLibrary, authParams } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  seedLibrary(getDb());
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();
const sr = (body: string) =>
  (JSON.parse(body) as Record<string, Record<string, unknown>>)['subsonic-response'];

describe('search3', () => {
  it('finds artists, albums, and songs in a single query', async () => {
    const res = await app.inject({ url: `/rest/search3.view?${auth}&query=Test` });
    const r = sr(res.body);
    expect(r.status).toBe('ok');
    const result = r.searchResult3 as Record<string, unknown[]>;
    expect(result.artist.length).toBe(1);
    expect(result.album.length).toBe(1);
    expect(result.song.length).toBe(1);
  });

  it('returns empty results for no match', async () => {
    const res = await app.inject({ url: `/rest/search3.view?${auth}&query=zzznomatch` });
    const r = sr(res.body);
    expect(r.status).toBe('ok');
    const result = r.searchResult3 as Record<string, unknown[]>;
    expect(result.artist.length).toBe(0);
    expect(result.album.length).toBe(0);
    expect(result.song.length).toBe(0);
  });

  it('honours artistCount=0 (returns only albums and songs)', async () => {
    const res = await app.inject({ url: `/rest/search3.view?${auth}&query=Test&artistCount=0` });
    const result = (sr(res.body).searchResult3) as Record<string, unknown[]>;
    expect(result.artist.length).toBe(0);
    expect(result.album.length).toBe(1);
    expect(result.song.length).toBe(1);
  });

  it('honours artistOffset beyond available results', async () => {
    const res = await app.inject({ url: `/rest/search3.view?${auth}&query=Test&artistOffset=100` });
    const result = (sr(res.body).searchResult3) as Record<string, unknown[]>;
    expect(result.artist.length).toBe(0);
  });

  it('finds an album when query matches only the album name', async () => {
    const res = await app.inject({ url: `/rest/search3.view?${auth}&query=Album&artistCount=0&songCount=0` });
    const result = (sr(res.body).searchResult3) as Record<string, unknown[]>;
    expect(result.album.length).toBe(1);
  });

  it('finds a song when query matches only the track title', async () => {
    const res = await app.inject({ url: `/rest/search3.view?${auth}&query=Track&artistCount=0&albumCount=0` });
    const result = (sr(res.body).searchResult3) as Record<string, unknown[]>;
    expect(result.song.length).toBe(1);
  });

  it('treats a literal underscore in the query as a literal character, not a wildcard', async () => {
    // "Test_Artist" would spuriously match "Test Artist" if `_` were left as
    // an unescaped LIKE wildcard (it matches any single character, including
    // the space) — it must not match once `_` is escaped.
    const res = await app.inject({
      url: `/rest/search3.view?${auth}&query=${encodeURIComponent('Test_Artist')}&albumCount=0&songCount=0`,
    });
    const result = (sr(res.body).searchResult3) as Record<string, unknown[]>;
    expect(result.artist.length).toBe(0);
  });

  it('treats a literal percent sign in the query as a literal character, not a wildcard', async () => {
    const res = await app.inject({
      url: `/rest/search3.view?${auth}&query=${encodeURIComponent('Test%Artist')}&albumCount=0&songCount=0`,
    });
    const result = (sr(res.body).searchResult3) as Record<string, unknown[]>;
    expect(result.artist.length).toBe(0);
  });
});
