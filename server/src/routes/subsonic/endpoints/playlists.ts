import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../../db/database.js';
import { sendOk, sendError, SubsonicErrorCode } from '../response.js';
import { xmlTag, songAttrs, toJson, isoDate, type SongRow } from '../serialize.js';

type Q = Record<string, string | string[] | undefined>;
const p = (req: FastifyRequest) => ({ ...(req.query as Q), ...((req.body as Q) ?? {}) });
const str = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const SONG_COLS = `
  t.id, t.title, t.track_no, t.disc_no, t.duration_s, t.size, t.bitrate,
  t.format, t.path, t.added_at, t.album_id, t.artist_id,
  t.replaygain_track, t.replaygain_album,
  ar.name AS artist_name, al.name AS album_name, al.year,
  f.created_at AS starred
FROM tracks t
JOIN artists ar ON ar.id = t.artist_id
JOIN albums al ON al.id = t.album_id
LEFT JOIN favorites f ON f.item_type = 'track' AND f.item_id = t.id AND f.user_id = ?`;

interface PlaylistRow {
  id: number;
  name: string;
  owner: string;
  owner_id: number;
  is_public: number;
  created_at: number;
  updated_at: number;
  songCount: number;
  duration: number;
  cover_path: string | null;
}

function playlistAttrs(row: PlaylistRow, userId: number) {
  return {
    id: String(row.id),
    name: row.name,
    owner: row.owner,
    public: Boolean(row.is_public),
    songCount: row.songCount,
    duration: Math.round(row.duration),
    created: isoDate(row.created_at),
    changed: isoDate(row.updated_at),
    allowedUser: row.owner_id === userId ? undefined : row.owner,
    coverArt: row.cover_path ? `pl-${row.id}` : undefined,
  };
}

const PLAYLIST_QUERY = `
  SELECT p.id, p.name, p.owner_id, p.is_public, p.created_at, p.updated_at, p.cover_path,
         u.username AS owner,
         COUNT(pt.track_id) AS songCount,
         COALESCE(SUM(t.duration_s), 0) AS duration
  FROM playlists p
  JOIN users u ON u.id = p.owner_id
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
  LEFT JOIN tracks t ON t.id = pt.track_id`;

function getPlaylists(req: FastifyRequest, reply: FastifyReply): void {
  const f = str(p(req).f);
  const db = getDb();
  const userId = req.subsonicUser!.id;

  const playlists = db
    .prepare(`${PLAYLIST_QUERY} WHERE p.owner_id = ? OR p.is_public = 1 GROUP BY p.id ORDER BY p.name`)
    .all(userId) as PlaylistRow[];

  sendOk(reply, f, {
    xml: xmlTag('playlists', {}, playlists.map((pl) => xmlTag('playlist', playlistAttrs(pl, userId))).join('')),
    json: { playlists: { playlist: playlists.map((pl) => toJson(playlistAttrs(pl, userId))) } },
  });
}

function getPlaylist(req: FastifyRequest, reply: FastifyReply): void {
  const { f, id } = p(req) as Record<string, string | undefined>;
  if (!id) return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const db = getDb();
  const userId = req.subsonicUser!.id;
  const numId = Number(id);

  const playlist = db
    .prepare(`${PLAYLIST_QUERY} WHERE p.id = ? AND (p.owner_id = ? OR p.is_public = 1) GROUP BY p.id`)
    .get(numId, userId) as PlaylistRow | undefined;

  if (!playlist) return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Playlist not found' });

  const songs = db
    .prepare(`SELECT ${SONG_COLS} JOIN playlist_tracks pt ON pt.track_id = t.id WHERE pt.playlist_id = ? ORDER BY pt.position`)
    .all(userId, numId) as SongRow[];

  const plAttrs = playlistAttrs(playlist, userId);
  sendOk(reply, f, {
    xml: xmlTag('playlist', plAttrs, songs.map((s) => xmlTag('entry', songAttrs(s))).join('')),
    json: { playlist: { ...toJson(plAttrs), entry: songs.map((s) => toJson(songAttrs(s))) } },
  });
}

function createPlaylist(req: FastifyRequest, reply: FastifyReply): void {
  const params = p(req);
  const { f, name } = params as Record<string, string | undefined>;
  const songIds = ([] as string[]).concat((params.songId as string | string[] | undefined) ?? []);

  if (!name) return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'name required' });

  const db = getDb();
  const userId = req.subsonicUser!.id;

  const playlistId = Number(
    db.prepare('INSERT INTO playlists (owner_id, name) VALUES (?, ?)').run(userId, name).lastInsertRowid,
  );

  if (songIds.length) {
    const insert = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
    db.transaction(() => {
      songIds.forEach((sid, i) => insert.run(playlistId, Number(sid), i));
    })();
  }

  // Return the newly created playlist
  const playlist = db
    .prepare(`${PLAYLIST_QUERY} WHERE p.id = ? GROUP BY p.id`)
    .get(playlistId) as PlaylistRow;

  const songs = songIds.length
    ? (db.prepare(`SELECT ${SONG_COLS} JOIN playlist_tracks pt ON pt.track_id = t.id WHERE pt.playlist_id = ? ORDER BY pt.position`).all(userId, playlistId) as SongRow[])
    : [];

  const plAttrs = playlistAttrs(playlist, userId);
  sendOk(reply, f, {
    xml: xmlTag('playlist', plAttrs, songs.map((s) => xmlTag('entry', songAttrs(s))).join('')),
    json: { playlist: { ...toJson(plAttrs), entry: songs.map((s) => toJson(songAttrs(s))) } },
  });
}

function updatePlaylist(req: FastifyRequest, reply: FastifyReply): void {
  const params = p(req);
  const { f, playlistId, name, comment, public: pub } = params as Record<string, string | undefined>;
  const songIdsToAdd = ([] as string[]).concat((params.songIdToAdd as string | string[] | undefined) ?? []);
  const indicesToRemove = ([] as string[]).concat((params.songIndexToRemove as string | string[] | undefined) ?? []);

  if (!playlistId) return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'playlistId required' });

  const db = getDb();
  const userId = req.subsonicUser!.id;
  const numId = Number(playlistId);

  const playlist = db
    .prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?')
    .get(numId, userId);
  if (!playlist) return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Playlist not found' });

  db.transaction(() => {
    if (name)     db.prepare('UPDATE playlists SET name = ?, updated_at = unixepoch() WHERE id = ?').run(name, numId);
    if (pub != null) db.prepare('UPDATE playlists SET is_public = ?, updated_at = unixepoch() WHERE id = ?').run(pub === 'true' ? 1 : 0, numId);

    // Add songs at the end
    if (songIdsToAdd.length) {
      const maxPos = (db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id = ?').get(numId) as { m: number }).m;
      const ins = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
      songIdsToAdd.forEach((sid, i) => ins.run(numId, Number(sid), maxPos + 1 + i));
    }

    // Remove by index (descending to preserve positions)
    if (indicesToRemove.length) {
      const positions = [...new Set(indicesToRemove.map(Number))].sort((a, b) => b - a);
      const rows = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(numId) as { track_id: number }[];
      const del = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ? AND position = ?');
      for (const idx of positions) {
        if (rows[idx]) del.run(numId, rows[idx].track_id, idx);
      }
      // Re-number positions
      const remaining = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position').all(numId) as { track_id: number }[];
      db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(numId);
      const ins = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
      remaining.forEach((r, i) => ins.run(numId, r.track_id, i));
    }
  })();

  sendOk(reply, f);
}

function deletePlaylist(req: FastifyRequest, reply: FastifyReply): void {
  const { f, id } = p(req) as Record<string, string | undefined>;
  if (!id) return sendError(reply, f, { code: SubsonicErrorCode.MISSING_PARAM, message: 'id required' });

  const db = getDb();
  const userId = req.subsonicUser!.id;

  const exists = db
    .prepare('SELECT id FROM playlists WHERE id = ? AND owner_id = ?')
    .get(Number(id), userId);
  if (!exists)
    return sendError(reply, f, { code: SubsonicErrorCode.DATA_NOT_FOUND, message: 'Playlist not found or not owned' });

  db.prepare('DELETE FROM playlists WHERE id = ?').run(Number(id));
  sendOk(reply, f);
}

export async function playlistsPlugin(app: FastifyInstance): Promise<void> {
  app.route({ method: ['GET', 'POST'], url: '/getPlaylists.view', handler: getPlaylists });
  app.route({ method: ['GET', 'POST'], url: '/getPlaylist.view', handler: getPlaylist });
  app.route({ method: ['GET', 'POST'], url: '/createPlaylist.view', handler: createPlaylist });
  app.route({ method: ['GET', 'POST'], url: '/updatePlaylist.view', handler: updatePlaylist });
  app.route({ method: ['GET', 'POST'], url: '/deletePlaylist.view', handler: deletePlaylist });
}
