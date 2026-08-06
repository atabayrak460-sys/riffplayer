import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { parseNamePairs, getOllamaRecommendations, generateWrappedSummary } from '../../recommendations/ollama.js';

describe('parseNamePairs', () => {
  it('parses simple "Artist - Track" lines', () => {
    const text = 'Radiohead - Karma Police\nDaft Punk - One More Time';
    expect(parseNamePairs(text)).toEqual([
      { artist: 'Radiohead', track: 'Karma Police' },
      { artist: 'Daft Punk', track: 'One More Time' },
    ]);
  });

  it('strips leading numbering', () => {
    expect(parseNamePairs('1. Radiohead - Karma Police\n2. Daft Punk - One More Time')).toEqual([
      { artist: 'Radiohead', track: 'Karma Police' },
      { artist: 'Daft Punk', track: 'One More Time' },
    ]);
  });

  it('trims stray whitespace around the separator', () => {
    expect(parseNamePairs('  Radiohead   -   Karma Police  ')).toEqual([
      { artist: 'Radiohead', track: 'Karma Police' },
    ]);
  });

  it('rejoins a track title that itself contains " - "', () => {
    expect(parseNamePairs('Daft Punk - One More Time - Remix')).toEqual([
      { artist: 'Daft Punk', track: 'One More Time - Remix' },
    ]);
  });

  it('drops commentary lines with no " - " separator', () => {
    const text = 'Here are some suggestions:\nRadiohead - Karma Police\nEnjoy!';
    expect(parseNamePairs(text)).toEqual([{ artist: 'Radiohead', track: 'Karma Police' }]);
  });

  it('drops a line with an empty artist', () => {
    expect(parseNamePairs(' - Karma Police')).toEqual([]);
  });

  it('drops a line with an empty track', () => {
    expect(parseNamePairs('Radiohead -   ')).toEqual([]);
  });

  it('drops blank lines', () => {
    expect(parseNamePairs('Radiohead - Karma Police\n\n\nDaft Punk - One More Time')).toEqual([
      { artist: 'Radiohead', track: 'Karma Police' },
      { artist: 'Daft Punk', track: 'One More Time' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseNamePairs('')).toEqual([]);
  });
});

describe('getOllamaRecommendations', () => {
  let app: FastifyInstance;
  let userId: number;

  beforeEach(async () => {
    app = await buildApp({ dbPath: ':memory:' });
    await app.ready();

    const db = getDb();
    userId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('Radiohead')").run().lastInsertRowid,
    );
    const albumId = Number(
      db.prepare("INSERT INTO albums (name, artist_id) VALUES ('OK Computer', ?)").run(artistId).lastInsertRowid,
    );
    const trackId = Number(
      db.prepare(`
        INSERT INTO tracks (title, album_id, artist_id, path, duration_s)
        VALUES ('Karma Police', ?, ?, '/music/kp.mp3', 260)
      `).run(albumId, artistId).lastInsertRowid,
    );
    db.prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)')
      .run(userId, trackId, Math.floor(Date.now() / 1000));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
    closeDb();
  });

  function mockOllamaChat(content: string) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content } }),
    }));
  }

  // getOllamaRecommendations' cache is a module-level singleton keyed on
  // userId+url+model, so each test below uses a distinct fake ollamaUrl —
  // otherwise a result cached by an earlier test would silently short-circuit
  // a later one's fetch call, regardless of test order.

  it('returns an empty array when the user has no play history', async () => {
    mockOllamaChat('Radiohead - Karma Police');
    const db = getDb();
    const otherUserId = Number(
      db.prepare("INSERT INTO users (username, password_hash) VALUES ('nouser', 'x')").run().lastInsertRowid,
    );
    const songs = await getOllamaRecommendations(otherUserId, 'http://ollama-1:11434', 'llama3.2');
    expect(songs).toEqual([]);
  });

  it('matches a parsed suggestion against the local library', async () => {
    mockOllamaChat('Radiohead - Karma Police\nSome Made Up Band - Nonexistent Song');
    const songs = await getOllamaRecommendations(userId, 'http://ollama-2:11434', 'llama3.2');
    expect(songs).toHaveLength(1);
    expect((songs[0] as { title: string }).title).toBe('Karma Police');
  });

  it('caches results per user/url/model and does not call Ollama again on a repeat request', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Radiohead - Karma Police' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await getOllamaRecommendations(userId, 'http://ollama-3:11434', 'llama3.2');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await getOllamaRecommendations(userId, 'http://ollama-3:11434', 'llama3.2');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('throws when Ollama responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getOllamaRecommendations(userId, 'http://ollama-4:11434', 'llama3.2')).rejects.toThrow(/500/);
  });
});

describe('generateWrappedSummary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the stats-derived prompt to Ollama and returns its text response', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'What a year of music!' } }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const summary = await generateWrappedSummary(
      {
        year: 2025,
        totalPlays: 500,
        totalMinutes: 6000,
        topArtists: [{ name: 'Radiohead', playCount: 42 }],
        topTracks: [{ title: 'Karma Police', artist: 'Radiohead', playCount: 10 }],
      },
      'http://ollama:11434',
      'llama3.2',
    );

    expect(summary).toBe('What a year of music!');
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/api/chat');
    const body = JSON.parse(opts.body as string) as { messages: [{ content: string }] };
    expect(body.messages[0].content).toContain('2025');
    expect(body.messages[0].content).toContain('Radiohead');
    expect(body.messages[0].content).toContain('Karma Police');
  });

  it('falls back to the /api/generate-style "response" field if "message" is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'Generated fallback text' }),
    }));

    const summary = await generateWrappedSummary(
      { year: 2025, totalPlays: 1, totalMinutes: 1, topArtists: [], topTracks: [] },
      'http://ollama:11434',
      'llama3.2',
    );
    expect(summary).toBe('Generated fallback text');
  });
});
