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

describe('GET /api/v1/history/last-played', () => {
  it('returns null when the user has no play history', async () => {
    seedLibrary(getDb());
    const res = await app.inject({ url: `/api/v1/history/last-played?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { song: unknown };
    expect(body.song).toBeNull();
  });

  it('returns the most recently played track', async () => {
    const db = getDb();
    const { albumId, artistId, trackId: trackA } = seedLibrary(db);
    const trackB = Number(
      db.prepare(`
        INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
        VALUES ('Track B', ?, ?, 2, 180, '/music/b.mp3', 900000, 'MPEG', 320)
      `).run(albumId, artistId).lastInsertRowid,
    );
    const userId = Number(
      (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id,
    );
    const now = Math.floor(Date.now() / 1000);
    const insertPlay = db.prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)');
    insertPlay.run(userId, trackA, now - 100);
    insertPlay.run(userId, trackB, now - 10);

    const res = await app.inject({ url: `/api/v1/history/last-played?${auth}` });
    const body = JSON.parse(res.body) as { song: { id: string } | null };
    expect(body.song?.id).toBe(String(trackB));
  });
});

describe('GET /api/v1/history/most-played', () => {
  it('only counts plays from the last 30 days', async () => {
    const db = getDb();
    const { albumId, artistId, trackId: recentTrackId } = seedLibrary(db);
    const oldTrackId = Number(
      db.prepare(`
        INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
        VALUES ('Old Track', ?, ?, 2, 180, '/music/old.mp3', 900000, 'MPEG', 320)
      `).run(albumId, artistId).lastInsertRowid,
    );

    const userId = Number(
      (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id,
    );

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 1 * 86400;
    const fortyDaysAgo = now - 40 * 86400;

    const insertPlay = db.prepare(
      'INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)',
    );
    // 5 plays inside the 30-day window for the "recent" track
    for (let i = 0; i < 5; i++) insertPlay.run(userId, recentTrackId, oneDayAgo);
    // 10 plays outside the 30-day window for the "old" track
    for (let i = 0; i < 10; i++) insertPlay.run(userId, oldTrackId, fortyDaysAgo);

    const res = await app.inject({ url: `/api/v1/history/most-played?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { songs: { id: string; playCount: number }[] };

    const ids = body.songs.map((s) => s.id);
    expect(ids).toContain(String(recentTrackId));
    expect(ids).not.toContain(String(oldTrackId));

    const recentEntry = body.songs.find((s) => s.id === String(recentTrackId));
    expect(recentEntry?.playCount).toBe(5);
  });

  it('returns tracks ordered by play count, most played first', async () => {
    const db = getDb();
    const { albumId, artistId, trackId: trackA } = seedLibrary(db);
    const trackB = Number(
      db.prepare(`
        INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
        VALUES ('Track B', ?, ?, 2, 180, '/music/b.mp3', 900000, 'MPEG', 320)
      `).run(albumId, artistId).lastInsertRowid,
    );

    const userId = Number(
      (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id,
    );

    const now = Math.floor(Date.now() / 1000);
    const insertPlay = db.prepare(
      'INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)',
    );
    for (let i = 0; i < 2; i++) insertPlay.run(userId, trackA, now);
    for (let i = 0; i < 7; i++) insertPlay.run(userId, trackB, now);

    const res = await app.inject({ url: `/api/v1/history/most-played?${auth}` });
    const body = JSON.parse(res.body) as { songs: { id: string; playCount: number }[] };

    expect(body.songs[0].id).toBe(String(trackB));
    expect(body.songs[0].playCount).toBe(7);
    expect(body.songs[1].id).toBe(String(trackA));
    expect(body.songs[1].playCount).toBe(2);
  });
});

describe('GET /api/v1/history/recent', () => {
  it('deduplicates by track — a track played many times appears once', async () => {
    const db = getDb();
    const { trackId } = seedLibrary(db);
    const userId = Number(
      (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id,
    );

    const now = Math.floor(Date.now() / 1000);
    const insertPlay = db.prepare(
      'INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)',
    );
    for (let i = 0; i < 35; i++) insertPlay.run(userId, trackId, now - i);

    const res = await app.inject({ url: `/api/v1/history/recent?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { songs: { id: string }[] };
    expect(body.songs).toHaveLength(1);
    expect(body.songs[0].id).toBe(String(trackId));
  });

  it('replaying an older track moves it to the top instead of adding a row', async () => {
    const db = getDb();
    const { albumId, artistId, trackId: trackA } = seedLibrary(db);
    const trackB = Number(
      db.prepare(`
        INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
        VALUES ('Track B', ?, ?, 2, 180, '/music/b.mp3', 900000, 'MPEG', 320)
      `).run(albumId, artistId).lastInsertRowid,
    );
    const userId = Number(
      (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id,
    );

    const now = Math.floor(Date.now() / 1000);
    const insertPlay = db.prepare(
      'INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)',
    );
    insertPlay.run(userId, trackA, now - 100); // A played first (older)
    insertPlay.run(userId, trackB, now - 50);  // then B (more recent than A's only play)

    let res = await app.inject({ url: `/api/v1/history/recent?${auth}` });
    let body = JSON.parse(res.body) as { songs: { id: string }[] };
    expect(body.songs.map((s) => s.id)).toEqual([String(trackB), String(trackA)]);

    // Replay A — it should jump back to the top, still as a single row
    insertPlay.run(userId, trackA, now);

    res = await app.inject({ url: `/api/v1/history/recent?${auth}` });
    body = JSON.parse(res.body) as { songs: { id: string }[] };
    expect(body.songs.map((s) => s.id)).toEqual([String(trackA), String(trackB)]);
  });

  it('caps at the 30 most recently played distinct tracks', async () => {
    const db = getDb();
    const { albumId, artistId } = seedLibrary(db);
    const userId = Number(
      (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id,
    );
    const insertTrack = db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
      VALUES (?, ?, ?, ?, 180, ?, 900000, 'MPEG', 320)
    `);
    const insertPlay = db.prepare(
      'INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)',
    );
    const now = Math.floor(Date.now() / 1000);

    const trackIds: number[] = [];
    for (let i = 0; i < 35; i++) {
      const id = Number(
        insertTrack.run(`Track ${i}`, albumId, artistId, i, `/music/t${i}.mp3`).lastInsertRowid,
      );
      trackIds.push(id);
      insertPlay.run(userId, id, now - i); // track 0 is most recent, track 34 is oldest
    }

    const res = await app.inject({ url: `/api/v1/history/recent?${auth}` });
    const body = JSON.parse(res.body) as { songs: { id: string }[] };
    expect(body.songs).toHaveLength(30);
    expect(body.songs.map((s) => s.id)).toEqual(trackIds.slice(0, 30).map(String));
  });
});
