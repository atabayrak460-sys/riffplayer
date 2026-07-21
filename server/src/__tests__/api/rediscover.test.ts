import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams, seedLibrary } from '../subsonic/helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();
const DAY = 24 * 60 * 60;

function insertTrack(db: ReturnType<typeof getDb>, albumId: number, artistId: number, title: string, path: string) {
  return Number(
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
      VALUES (?, ?, ?, 1, 180, ?, 900000, 'MPEG', 320)
    `).run(title, albumId, artistId, path).lastInsertRowid,
  );
}

describe('GET /api/v1/history/rediscover', () => {
  it('excludes tracks added too recently to have had a fair chance', async () => {
    const db = getDb();
    const { albumId, artistId, trackId } = seedLibrary(db);
    // seedLibrary's track defaults added_at to "now" — too recent, should be excluded.
    const res = await app.inject({ url: `/api/v1/history/rediscover?${auth}` });
    const body = JSON.parse(res.body) as { songs: { id: string }[] };
    expect(body.songs.map((s) => s.id)).not.toContain(String(trackId));
    void albumId; void artistId;
  });

  it('never-played tracks come before ones that have been played, oldest-added first among ties', async () => {
    const db = getDb();
    const { albumId, artistId } = seedLibrary(db);
    const now = Math.floor(Date.now() / 1000);

    const neverPlayedOlder = insertTrack(db, albumId, artistId, 'Never Played (older)', '/music/np-old.mp3');
    const neverPlayedNewer = insertTrack(db, albumId, artistId, 'Never Played (newer)', '/music/np-new.mp3');
    const playedLongAgo = insertTrack(db, albumId, artistId, 'Played Long Ago', '/music/played.mp3');

    db.prepare('UPDATE tracks SET added_at = ? WHERE id = ?').run(now - 30 * DAY, neverPlayedOlder);
    db.prepare('UPDATE tracks SET added_at = ? WHERE id = ?').run(now - 20 * DAY, neverPlayedNewer);
    db.prepare('UPDATE tracks SET added_at = ? WHERE id = ?').run(now - 30 * DAY, playedLongAgo);

    const userId = Number((db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id);
    db.prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)').run(userId, playedLongAgo, now - 25 * DAY);

    const res = await app.inject({ url: `/api/v1/history/rediscover?${auth}` });
    const body = JSON.parse(res.body) as { songs: { id: string }[] };
    const ids = body.songs.map((s) => s.id);

    expect(ids.indexOf(String(neverPlayedOlder))).toBeLessThan(ids.indexOf(String(playedLongAgo)));
    expect(ids.indexOf(String(neverPlayedNewer))).toBeLessThan(ids.indexOf(String(playedLongAgo)));
    // Among the two never-played tracks (tied on "never"), the older addition sorts first.
    expect(ids.indexOf(String(neverPlayedOlder))).toBeLessThan(ids.indexOf(String(neverPlayedNewer)));
  });

  it('among played tracks, the one played longest ago sorts first', async () => {
    const db = getDb();
    const { albumId, artistId } = seedLibrary(db);
    const now = Math.floor(Date.now() / 1000);

    const playedRecently = insertTrack(db, albumId, artistId, 'Played Recently', '/music/recent.mp3');
    const playedLongAgo = insertTrack(db, albumId, artistId, 'Played Long Ago', '/music/old.mp3');
    db.prepare('UPDATE tracks SET added_at = ? WHERE id IN (?, ?)').run(now - 60 * DAY, playedRecently, playedLongAgo);

    const userId = Number((db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id);
    db.prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)').run(userId, playedRecently, now - 1 * DAY);
    db.prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)').run(userId, playedLongAgo, now - 50 * DAY);

    const res = await app.inject({ url: `/api/v1/history/rediscover?${auth}` });
    const body = JSON.parse(res.body) as { songs: { id: string }[] };
    const ids = body.songs.map((s) => s.id);

    expect(ids.indexOf(String(playedLongAgo))).toBeLessThan(ids.indexOf(String(playedRecently)));
  });
});
