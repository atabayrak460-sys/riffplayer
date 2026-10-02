import { mkdtemp, writeFile, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams, seedLibrary } from '../subsonic/helpers.js';
import { signToken } from '../../auth/jwt.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams(); // admin/admin

function regularUserToken(): string {
  const userId = Number(
    getDb().prepare("INSERT INTO users (username, password_hash, role) VALUES ('regular', 'x', 'user')").run()
      .lastInsertRowid,
  );
  return signToken({ id: userId, username: 'regular', role: 'user', token_version: 0 });
}

describe('DELETE /api/v1/admin/tracks/:id', () => {
  it('returns 403 for a non-admin user', async () => {
    const { trackId } = seedLibrary(getDb());
    const token = regularUserToken();
    const res = await app.inject({
      method: 'DELETE', url: `/api/v1/admin/tracks/${trackId}`, headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(getDb().prepare('SELECT id FROM tracks WHERE id = ?').get(trackId)).toBeDefined();
  });

  it('returns 404 for a track that does not exist', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/tracks/999999?${auth}` });
    expect(res.statusCode).toBe(404);
  });

  it('deletes the track row', async () => {
    const { trackId } = seedLibrary(getDb());
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/tracks/${trackId}?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(getDb().prepare('SELECT id FROM tracks WHERE id = ?').get(trackId)).toBeUndefined();
  });

  it('removes the track from any playlist it was in (FK cascade)', async () => {
    const db = getDb();
    const { trackId } = seedLibrary(db);
    const playlistId = Number(
      db.prepare("INSERT INTO playlists (name, owner_id) VALUES ('My playlist', 1)").run().lastInsertRowid,
    );
    db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, 0)')
      .run(playlistId, trackId);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/tracks/${trackId}?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(db.prepare('SELECT * FROM playlist_tracks WHERE track_id = ?').get(trackId)).toBeUndefined();
  });

  it('deletes a track that has play history without a foreign-key error', async () => {
    // Regression guard: play_history.track_id has no ON DELETE CASCADE
    // (unlike playlist_tracks, which does) — with
    // `PRAGMA foreign_keys = ON`, a naive `DELETE FROM tracks` on a track
    // that's ever been played would otherwise fail outright.
    const db = getDb();
    const { trackId } = seedLibrary(db);
    db.prepare("INSERT INTO play_history (user_id, track_id, client) VALUES (1, ?, 'test')").run(trackId);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/tracks/${trackId}?${auth}` });
    expect(res.statusCode).toBe(200);
    expect(db.prepare('SELECT id FROM tracks WHERE id = ?').get(trackId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM play_history WHERE track_id = ?').get(trackId)).toBeUndefined();
  });

  it('deletes the actual audio file from disk', async () => {
    const db = getDb();
    const dir = await mkdtemp(join(tmpdir(), 'riffplayer-track-delete-'));
    const filePath = join(dir, 'song.mp3');
    await writeFile(filePath, 'fake audio data');

    const { trackId } = seedLibrary(db);
    db.prepare('UPDATE tracks SET path = ? WHERE id = ?').run(filePath, trackId);

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/admin/tracks/${trackId}?${auth}` });
    expect(res.statusCode).toBe(200);
    await expect(access(filePath)).rejects.toThrow();
  });
});
