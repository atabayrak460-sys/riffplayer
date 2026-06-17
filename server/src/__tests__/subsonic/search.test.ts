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
  it('finds artists by name', async () => {
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
});
