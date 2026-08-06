import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { closeDb, getDb } from '../db/database.js';
import { fireExternalScrobbles, lfmSign } from '../scrobbler.js';

// fireExternalScrobbles chains Promise.resolve().then(async () => ...), so
// give the microtask queue a few turns to run the fire-and-forget work
// before asserting on it.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

describe('lfmSign', () => {
  it('sorts params before concatenating, then appends the secret before hashing', () => {
    const expected = createHash('md5').update('api_keyKartistAsecret').digest('hex');
    expect(lfmSign({ artist: 'A', api_key: 'K' }, 'secret')).toBe(expected);
  });

  it('produces a different signature when any param value changes', () => {
    const a = lfmSign({ track: 'Song' }, 'secret');
    const b = lfmSign({ track: 'Song2' }, 'secret');
    expect(a).not.toBe(b);
  });

  it('produces a different signature for a different secret', () => {
    const a = lfmSign({ track: 'Song' }, 'secret1');
    const b = lfmSign({ track: 'Song' }, 'secret2');
    expect(a).not.toBe(b);
  });
});

describe('fireExternalScrobbles', () => {
  let app: FastifyInstance;
  let userId: number;
  let trackId: number;

  beforeEach(async () => {
    app = await buildApp({ dbPath: ':memory:' });
    await app.ready();

    const db = getDb();
    userId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('Artist')").run().lastInsertRowid,
    );
    const albumId = Number(
      db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').run('Album', artistId).lastInsertRowid,
    );
    trackId = Number(
      db.prepare(`
        INSERT INTO tracks (title, album_id, artist_id, path, duration_s)
        VALUES ('Track', ?, ?, '/music/t.mp3', 200)
      `).run(albumId, artistId).lastInsertRowid,
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
    closeDb();
  });

  it('makes no external requests when the user has no scrobbling prefs configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    fireExternalScrobbles(userId, trackId, Date.now());
    await flushMicrotasks();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('makes no external requests for an unknown track id', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    fireExternalScrobbles(userId, 999999, Date.now());
    await flushMicrotasks();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scrobbles to ListenBrainz when a token is configured', async () => {
    getDb()
      .prepare('INSERT INTO user_preferences (user_id, listenbrainz_token) VALUES (?, ?)')
      .run(userId, 'lb-token');

    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    fireExternalScrobbles(userId, trackId, 1700000000);
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.listenbrainz.org/1/submit-listens');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Token lb-token');

    const body = (JSON.parse(opts.body as string) as {
      payload: [{ listened_at: number; track_metadata: { track_name: string; artist_name: string; release_name: string } }];
    });
    expect(body.payload[0].listened_at).toBe(1700000000);
    expect(body.payload[0].track_metadata.track_name).toBe('Track');
    expect(body.payload[0].track_metadata.artist_name).toBe('Artist');
    expect(body.payload[0].track_metadata.release_name).toBe('Album');
  });

  it('scrobbles to Last.fm with a correctly signed request when enabled and configured', async () => {
    const db = getDb();
    db.prepare('INSERT INTO user_preferences (user_id, lastfm_session_key) VALUES (?, ?)').run(userId, 'sess-key');
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_enabled', 'true')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_key', 'api-key')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_secret', 'api-secret')").run();

    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    fireExternalScrobbles(userId, trackId, 1700000000);
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ws.audioscrobbler.com/2.0/');

    const sentParams = Object.fromEntries(opts.body as URLSearchParams);
    expect(sentParams.artist).toBe('Artist');
    expect(sentParams.track).toBe('Track');
    expect(sentParams.album).toBe('Album');
    expect(sentParams.sk).toBe('sess-key');

    const signable = Object.fromEntries(
      Object.entries(sentParams).filter(([k]) => k !== 'api_sig' && k !== 'format'),
    );
    expect(sentParams.api_sig).toBe(lfmSign(signable, 'api-secret'));
  });

  it('does not scrobble to Last.fm when lastfm_enabled is not "true", even with a session key configured', async () => {
    const db = getDb();
    db.prepare('INSERT INTO user_preferences (user_id, lastfm_session_key) VALUES (?, ?)').run(userId, 'sess-key');
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_key', 'api-key')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_secret', 'api-secret')").run();

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    fireExternalScrobbles(userId, trackId, 1700000000);
    await flushMicrotasks();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows network failures from both scrobble targets without throwing or an unhandled rejection', async () => {
    const db = getDb();
    db.prepare('INSERT INTO user_preferences (user_id, lastfm_session_key, listenbrainz_token) VALUES (?, ?, ?)')
      .run(userId, 'sess-key', 'lb-token');
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_enabled', 'true')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_key', 'api-key')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('lastfm_api_secret', 'api-secret')").run();

    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchSpy);

    expect(() => fireExternalScrobbles(userId, trackId, 1700000000)).not.toThrow();
    await flushMicrotasks();

    // If fireExternalScrobbles' per-target .catch() handlers were removed,
    // the rejected fetch promises would surface as unhandled rejections and
    // fail this test run.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
