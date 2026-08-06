import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams, seedLibrary } from '../subsonic/helpers.js';

let app: FastifyInstance;
const auth = authParams();

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await app.close();
  closeDb();
});

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

describe('GET /api/v1/recommendations/similar', () => {
  it('returns 403 when recommendations are disabled', async () => {
    setSetting('recommendations_enabled', 'false');
    const res = await app.inject({ url: `/api/v1/recommendations/similar?${auth}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 503 when no Last.fm API key is configured', async () => {
    const res = await app.inject({ url: `/api/v1/recommendations/similar?${auth}` });
    expect(res.statusCode).toBe(503);
  });

  it('returns matched local tracks from Last.fm similar artists (200)', async () => {
    seedLibrary(getDb());
    setSetting('lastfm_api_key', 'test-key');

    // seedLibrary's artist is 'Test Artist' — the user needs a play so it
    // shows up as a "top artist" for getLastFmRecommendations to look up.
    const userId = (getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const track = getDb().prepare('SELECT id FROM tracks LIMIT 1').get() as { id: number };
    getDb().prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)')
      .run(userId, track.id, Math.floor(Date.now() / 1000));

    // A second artist+track that Last.fm will report as "similar" to the
    // user's top artist, so it can actually be matched against the library.
    const otherArtistId = Number(
      getDb().prepare("INSERT INTO artists (name) VALUES ('Similar Artist')").run().lastInsertRowid,
    );
    const otherAlbumId = Number(
      getDb().prepare("INSERT INTO albums (name, artist_id) VALUES ('Similar Album', ?)")
        .run(otherArtistId).lastInsertRowid,
    );
    getDb().prepare(`
      INSERT INTO tracks (title, album_id, artist_id, path, duration_s)
      VALUES ('Similar Track', ?, ?, '/music/similar.mp3', 200)
    `).run(otherAlbumId, otherArtistId);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ similarartists: { artist: [{ name: 'Similar Artist' }] } }),
    }));

    const res = await app.inject({ url: `/api/v1/recommendations/similar?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { songs: { title: string }[]; source: string };
    expect(body.source).toBe('lastfm');
    expect(body.songs.map((s) => s.title)).toEqual(['Similar Track']);
  });
});

describe('GET /api/v1/recommendations/discover', () => {
  it('returns 403 when recommendations are disabled', async () => {
    setSetting('recommendations_enabled', 'false');
    const res = await app.inject({ url: `/api/v1/recommendations/discover?${auth}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 503 when neither Ollama nor Last.fm is configured', async () => {
    const res = await app.inject({ url: `/api/v1/recommendations/discover?${auth}` });
    expect(res.statusCode).toBe(503);
  });

  it('prefers Ollama over Last.fm when both are configured', async () => {
    seedLibrary(getDb());
    setSetting('ollama_url', 'http://ollama-discover:11434');
    setSetting('lastfm_api_key', 'unused-key');

    const userId = (getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const track = getDb().prepare('SELECT id FROM tracks LIMIT 1').get() as { id: number };
    getDb().prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)')
      .run(userId, track.id, Math.floor(Date.now() / 1000));

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Test Artist - Test Track' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await app.inject({ url: `/api/v1/recommendations/discover?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { source: string };
    expect(body.source).toBe('ollama');
    expect(fetchSpy).toHaveBeenCalledWith('http://ollama-discover:11434/api/chat', expect.anything());
  });
});

describe('GET /api/v1/recommendations/wrapped', () => {
  it('defaults to the current year and returns empty stats with no play history', async () => {
    const res = await app.inject({ url: `/api/v1/recommendations/wrapped?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { year: number; totalPlays: number };
    expect(body.year).toBe(new Date().getFullYear());
    expect(body.totalPlays).toBe(0);
  });

  it('honors an explicit ?year= query param', async () => {
    const res = await app.inject({ url: `/api/v1/recommendations/wrapped?${auth}&year=2019` });
    const body = res.json() as { year: number };
    expect(body.year).toBe(2019);
  });
});

describe('POST /api/v1/recommendations/wrapped/summary', () => {
  it('returns 503 when Ollama is not configured', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/v1/recommendations/wrapped/summary?${auth}` });
    expect(res.statusCode).toBe(503);
  });

  it('returns 404 when there is no play history for the requested year', async () => {
    setSetting('ollama_url', 'http://ollama-summary:11434');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/recommendations/wrapped/summary?${auth}&year=2019`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('generates a narrative summary from Ollama when play history exists (200)', async () => {
    setSetting('ollama_url', 'http://ollama-summary:11434');
    seedLibrary(getDb());
    const userId = (getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const track = getDb().prepare('SELECT id FROM tracks LIMIT 1').get() as { id: number };
    getDb().prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)')
      .run(userId, track.id, Math.floor(Date.now() / 1000));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'What a year!' } }),
    }));

    const res = await app.inject({ method: 'POST', url: `/api/v1/recommendations/wrapped/summary?${auth}` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { summary: string }).summary).toBe('What a year!');
  });
});
