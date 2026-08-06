import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { getWrappedStats } from '../../recommendations/wrapped.js';

let app: FastifyInstance;
let userId: number;
let artistId: number;
let albumId: number;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();

  const db = getDb();
  userId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
  artistId = Number(db.prepare("INSERT INTO artists (name) VALUES ('Radiohead')").run().lastInsertRowid);
  albumId = Number(
    db.prepare("INSERT INTO albums (name, artist_id) VALUES ('OK Computer', ?)").run(artistId).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
});

function addTrack(title: string, durationS = 200): number {
  return Number(
    getDb().prepare(`
      INSERT INTO tracks (title, album_id, artist_id, path, duration_s)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, albumId, artistId, `/music/${title}.mp3`, durationS).lastInsertRowid,
  );
}

function playAt(trackId: number, isoDate: string): void {
  const playedAt = Math.floor(new Date(isoDate).getTime() / 1000);
  getDb().prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)')
    .run(userId, trackId, playedAt);
}

describe('getWrappedStats — year bounds', () => {
  it('includes a play at the very first second of the requested year (UTC)', () => {
    const track = addTrack('Track A');
    playAt(track, '2025-01-01T00:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.totalPlays).toBe(1);
  });

  it('excludes a play from the last second of the previous year', () => {
    const track = addTrack('Track A');
    playAt(track, '2024-12-31T23:59:59Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.totalPlays).toBe(0);
  });

  it('includes a play at the last second of the requested year', () => {
    const track = addTrack('Track A');
    playAt(track, '2025-12-31T23:59:59Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.totalPlays).toBe(1);
  });

  it('excludes a play from the first second of the next year', () => {
    const track = addTrack('Track A');
    playAt(track, '2026-01-01T00:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.totalPlays).toBe(0);
  });

  it('excludes plays by a different user', () => {
    const otherUserId = Number(
      getDb().prepare("INSERT INTO users (username, password_hash) VALUES ('other', 'x')").run().lastInsertRowid,
    );
    const track = addTrack('Track A');
    getDb().prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)')
      .run(otherUserId, track, Math.floor(new Date('2025-06-01T00:00:00Z').getTime() / 1000));

    const stats = getWrappedStats(userId, 2025);
    expect(stats.totalPlays).toBe(0);
  });
});

describe('getWrappedStats — byMonth bucketing', () => {
  it('groups plays into the correct calendar month, summed across multiple plays in the same month', () => {
    const track = addTrack('Track A');
    playAt(track, '2025-01-05T12:00:00Z');
    playAt(track, '2025-01-20T12:00:00Z');
    playAt(track, '2025-06-15T12:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    const byMonth = new Map(stats.byMonth.map((m) => [m.month, m.plays]));
    expect(byMonth.get(1)).toBe(2);
    expect(byMonth.get(6)).toBe(1);
    expect(stats.byMonth).toHaveLength(2); // only months with plays are present
  });

  it('returns an empty byMonth array when there is no play history for the year', () => {
    const stats = getWrappedStats(userId, 2025);
    expect(stats.byMonth).toEqual([]);
  });

  it('orders byMonth ascending by month number', () => {
    const track = addTrack('Track A');
    playAt(track, '2025-11-01T00:00:00Z');
    playAt(track, '2025-02-01T00:00:00Z');
    playAt(track, '2025-07-01T00:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.byMonth.map((m) => m.month)).toEqual([2, 7, 11]);
  });
});

describe('getWrappedStats — top tracks/artists/albums', () => {
  it('orders top tracks by play count descending', () => {
    const popular = addTrack('Popular');
    const rare = addTrack('Rare');
    playAt(popular, '2025-01-01T00:00:00Z');
    playAt(popular, '2025-01-02T00:00:00Z');
    playAt(popular, '2025-01-03T00:00:00Z');
    playAt(rare, '2025-01-01T00:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.topTracks[0].title).toBe('Popular');
    expect(stats.topTracks[0].playCount).toBe(3);
    expect(stats.topTracks[1].title).toBe('Rare');
    expect(stats.topTracks[1].playCount).toBe(1);
  });

  it('aggregates total minutes from track duration, rounded', () => {
    const track = addTrack('Track A', 150); // 2.5 minutes
    playAt(track, '2025-01-01T00:00:00Z');
    playAt(track, '2025-01-02T00:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.totalMinutes).toBe(5); // 300s / 60
  });

  it('reports a single top artist and album correctly attributed', () => {
    const track = addTrack('Track A');
    playAt(track, '2025-01-01T00:00:00Z');

    const stats = getWrappedStats(userId, 2025);
    expect(stats.topArtists[0].name).toBe('Radiohead');
    expect(stats.topAlbums[0].name).toBe('OK Computer');
    expect(stats.topAlbums[0].artist).toBe('Radiohead');
  });
});
