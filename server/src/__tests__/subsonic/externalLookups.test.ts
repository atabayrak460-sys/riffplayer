import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from './helpers.js';

let app: FastifyInstance;
let tmpDir: string;
let fetchMock: ReturnType<typeof vi.fn>;

const auth = authParams();

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'riffplayer-lookups-'));
  process.env.COVERS_DIR = path.join(tmpDir, 'cache');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.COVERS_DIR;
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

function seedTrack(): { trackId: number; albumId: number } {
  const db = getDb();
  const artistId = Number(db.prepare("INSERT INTO artists (name) VALUES ('Artist')").run().lastInsertRowid);
  const albumId = Number(
    db.prepare('INSERT INTO albums (name, artist_id, mbid) VALUES (?, ?, ?)').run('Album', artistId, 'mbid-1234').lastInsertRowid,
  );
  const trackId = Number(
    db
      .prepare('INSERT INTO tracks (title, album_id, artist_id, path, duration_s) VALUES (?, ?, ?, ?, ?)')
      // A path that doesn't exist: no .lrc sidecar, no embedded art to extract.
      .run('Song', albumId, artistId, path.join(tmpDir, 'missing.mp3'), 200).lastInsertRowid,
  );
  return { trackId, albumId };
}

function lyricsUrl(trackId: number): string {
  return `/rest/getLyricsBySongId.view?${auth}&id=${trackId}`;
}

function coverUrl(albumId: number): string {
  return `/rest/getCoverArt.view?${auth}&id=al-${albumId}`;
}

const LRCLIB_HIT = {
  ok: true,
  json: async () => ({ syncedLyrics: '[00:01.00] hello', plainLyrics: 'hello' }),
};

describe('lyrics lookup (LRCLIB)', () => {
  it('contacts lrclib.net by default when a track has no local lyrics', async () => {
    const { trackId } = seedTrack();
    fetchMock.mockResolvedValue(LRCLIB_HIT);

    await app.inject({ url: lyricsUrl(trackId) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('lrclib.net');
  });

  it('never contacts lrclib.net once the admin switches it off', async () => {
    const { trackId } = seedTrack();
    setSetting('lyrics_lookup_enabled', 'false');
    fetchMock.mockResolvedValue(LRCLIB_HIT);

    const res = await app.inject({ url: lyricsUrl(trackId) });

    expect(fetchMock).not.toHaveBeenCalled();
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed'); // "No lyrics found", not a crash
  });

  it('is still on when the setting is anything other than "false"', async () => {
    const { trackId } = seedTrack();
    setSetting('lyrics_lookup_enabled', 'true');
    fetchMock.mockResolvedValue(LRCLIB_HIT);

    await app.inject({ url: lyricsUrl(trackId) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('cover art lookup (Cover Art Archive)', () => {
  it('contacts coverartarchive.org by default when an album has no local art', async () => {
    const { albumId } = seedTrack();
    fetchMock.mockResolvedValue({ ok: false });

    await app.inject({ url: coverUrl(albumId) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('coverartarchive.org/release/mbid-1234');
  });

  it('never contacts coverartarchive.org once the admin switches it off', async () => {
    const { albumId } = seedTrack();
    setSetting('cover_lookup_enabled', 'false');
    fetchMock.mockResolvedValue({ ok: false });

    const res = await app.inject({ url: coverUrl(albumId) });

    expect(fetchMock).not.toHaveBeenCalled();
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed'); // DATA_NOT_FOUND, not a crash
  });

  it('the two switches are independent', async () => {
    const { trackId, albumId } = seedTrack();
    setSetting('lyrics_lookup_enabled', 'false');
    fetchMock.mockResolvedValue({ ok: false });

    await app.inject({ url: lyricsUrl(trackId) });
    expect(fetchMock).not.toHaveBeenCalled();

    await app.inject({ url: coverUrl(albumId) });
    expect(fetchMock).toHaveBeenCalledTimes(1); // cover lookup still on
  });
});
