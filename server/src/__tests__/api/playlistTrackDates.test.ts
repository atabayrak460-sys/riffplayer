import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { seedLibrary, authParams } from '../subsonic/helpers.js';

let app: FastifyInstance;
let ids: ReturnType<typeof seedLibrary>;
let track2Id: number;
let track3Id: number;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  ids = seedLibrary(getDb());

  const db = getDb();
  track2Id = Number(
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
      VALUES ('Track 2', ?, ?, 2, 180, '/music/t2.mp3', 900000, 'MPEG', 320)
    `).run(ids.albumId, ids.artistId).lastInsertRowid,
  );
  track3Id = Number(
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
      VALUES ('Track 3', ?, ?, 3, 180, '/music/t3.mp3', 900000, 'MPEG', 320)
    `).run(ids.albumId, ids.artistId).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
});

const auth = authParams();
const sr = (body: string) =>
  (JSON.parse(body) as Record<string, Record<string, unknown>>)['subsonic-response'];

function trackDatesFromDb(playlistId: number): { track_id: number; added_at: number | null }[] {
  return getDb()
    .prepare('SELECT track_id, added_at FROM playlist_tracks WHERE playlist_id = ? ORDER BY position')
    .all(playlistId) as { track_id: number; added_at: number | null }[];
}

describe('playlist_tracks.added_at — set on creation', () => {
  it('createPlaylist sets added_at for its initial tracks', async () => {
    const res = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=Mix&songId=${ids.trackId}`,
    });
    const plId = Number((sr(res.body).playlist as Record<string, unknown>).id);

    const rows = trackDatesFromDb(plId);
    expect(rows).toHaveLength(1);
    expect(rows[0].added_at).not.toBeNull();
  });

  it('updatePlaylist songIdToAdd sets added_at for the newly added track', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=Empty` });
    const plId = Number((sr(create.body).playlist as Record<string, unknown>).id);

    await app.inject({
      url: `/rest/updatePlaylist.view?${auth}&playlistId=${plId}&songIdToAdd=${ids.trackId}`,
    });

    const rows = trackDatesFromDb(plId);
    expect(rows).toHaveLength(1);
    expect(rows[0].added_at).not.toBeNull();
  });
});

describe('playlist_tracks.added_at — preserved across mutations that renumber position', () => {
  it('updatePlaylist songIndexToRemove keeps the remaining tracks\' added_at unchanged', async () => {
    const create = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=Full&songId=${ids.trackId}&songId=${track2Id}&songId=${track3Id}`,
    });
    const plId = Number((sr(create.body).playlist as Record<string, unknown>).id);

    // Give each track a distinct, known added_at so we can tell them apart.
    const db = getDb();
    db.prepare('UPDATE playlist_tracks SET added_at = 1000 WHERE playlist_id = ? AND track_id = ?').run(plId, ids.trackId);
    db.prepare('UPDATE playlist_tracks SET added_at = 2000 WHERE playlist_id = ? AND track_id = ?').run(plId, track2Id);
    db.prepare('UPDATE playlist_tracks SET added_at = 3000 WHERE playlist_id = ? AND track_id = ?').run(plId, track3Id);

    // Remove the middle track (position 1 = track2)
    await app.inject({ url: `/rest/updatePlaylist.view?${auth}&playlistId=${plId}&songIndexToRemove=1` });

    const rows = trackDatesFromDb(plId);
    expect(rows.map((r) => r.track_id)).toEqual([ids.trackId, track3Id]);
    expect(rows.find((r) => r.track_id === ids.trackId)?.added_at).toBe(1000);
    expect(rows.find((r) => r.track_id === track3Id)?.added_at).toBe(3000);
  });
});

describe('PUT /api/v1/playlists/:id/tracks — added_at survives drag-reorder', () => {
  it('preserves each track\'s original added_at when only their order changes', async () => {
    const create = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=Ordered&songId=${ids.trackId}&songId=${track2Id}&songId=${track3Id}`,
    });
    const plId = Number((sr(create.body).playlist as Record<string, unknown>).id);

    const db = getDb();
    db.prepare('UPDATE playlist_tracks SET added_at = 1000 WHERE playlist_id = ? AND track_id = ?').run(plId, ids.trackId);
    db.prepare('UPDATE playlist_tracks SET added_at = 2000 WHERE playlist_id = ? AND track_id = ?').run(plId, track2Id);
    db.prepare('UPDATE playlist_tracks SET added_at = 3000 WHERE playlist_id = ? AND track_id = ?').run(plId, track3Id);

    // Reverse the order via the custom reorder endpoint (what drag-and-drop calls).
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/playlists/${plId}/tracks?${auth}`,
      payload: { trackIds: [String(track3Id), String(track2Id), String(ids.trackId)] },
    });
    expect(res.statusCode).toBe(200);

    const rows = trackDatesFromDb(plId);
    // New position order:
    expect(rows.map((r) => r.track_id)).toEqual([track3Id, track2Id, ids.trackId]);
    // But each track kept its own original added_at — reordering is not "re-adding".
    expect(rows.find((r) => r.track_id === ids.trackId)?.added_at).toBe(1000);
    expect(rows.find((r) => r.track_id === track2Id)?.added_at).toBe(2000);
    expect(rows.find((r) => r.track_id === track3Id)?.added_at).toBe(3000);
  });
});

describe('GET /api/v1/playlists/:id/track-dates', () => {
  it('returns each track\'s added_at as an ISO date', async () => {
    const create = await app.inject({
      url: `/rest/createPlaylist.view?${auth}&name=Dated&songId=${ids.trackId}&songId=${track2Id}`,
    });
    const plId = Number((sr(create.body).playlist as Record<string, unknown>).id);

    const db = getDb();
    db.prepare('UPDATE playlist_tracks SET added_at = 1700000000 WHERE playlist_id = ? AND track_id = ?').run(plId, ids.trackId);
    db.prepare('UPDATE playlist_tracks SET added_at = 1710000000 WHERE playlist_id = ? AND track_id = ?').run(plId, track2Id);

    const res = await app.inject({ url: `/api/v1/playlists/${plId}/track-dates?${auth}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { dates: Record<string, string> };

    expect(body.dates[String(ids.trackId)]).toBe(new Date(1700000000 * 1000).toISOString());
    expect(body.dates[String(track2Id)]).toBe(new Date(1710000000 * 1000).toISOString());
  });

  it('returns 404 for a playlist that does not exist or is not visible to the user', async () => {
    const res = await app.inject({ url: `/api/v1/playlists/99999/track-dates?${auth}` });
    expect(res.statusCode).toBe(404);
  });
});
