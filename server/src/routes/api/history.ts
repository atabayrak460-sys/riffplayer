import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { songAttrs, toJson, type SongRow } from '../subsonic/serialize.js';
import { SONG_SELECT_LIST, SONG_FROM } from '../subsonic/endpoints/browse.js';

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
// Tracks added more recently than this haven't had a fair chance to be played
// yet, so they're excluded from "Rediscover" rather than looking neglected.
const MIN_LIBRARY_AGE_S = 3 * 24 * 60 * 60;

export async function historyPlugin(app: FastifyInstance): Promise<void> {
  // GET /api/v1/history/last-played — the single most recent play, for "Continue Listening"
  app.get('/last-played', async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const userId = req.subsonicUser!.id;

    const row = db
      .prepare(`
        SELECT ${SONG_SELECT_LIST}
        ${SONG_FROM}
        JOIN play_history ph ON ph.track_id = t.id AND ph.user_id = ?
        ORDER BY ph.played_at DESC
        LIMIT 1
      `)
      .get(userId, userId) as SongRow | undefined;

    reply.send({ song: row ? toJson(songAttrs(row)) : null });
  });

  // GET /api/v1/history/recent — last 30 distinct tracks, most recently played first
  app.get('/recent', async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const userId = req.subsonicUser!.id;

    const rows = db
      .prepare(`
        SELECT ${SONG_SELECT_LIST}
        ${SONG_FROM}
        JOIN play_history ph ON ph.track_id = t.id AND ph.user_id = ?
        GROUP BY t.id
        ORDER BY MAX(ph.played_at) DESC
        LIMIT 30
      `)
      .all(userId, userId) as SongRow[];

    reply.send({ songs: rows.map((r) => toJson(songAttrs(r))) });
  });

  // GET /api/v1/history/most-played — top 30 tracks by play count in the last 30 days
  app.get('/most-played', async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const userId = req.subsonicUser!.id;
    const since = Math.floor(Date.now() / 1000) - THIRTY_DAYS_S;

    const rows = db
      .prepare(`
        SELECT ${SONG_SELECT_LIST}, COUNT(ph.id) AS playCount
        ${SONG_FROM}
        JOIN play_history ph ON ph.track_id = t.id AND ph.user_id = ? AND ph.played_at >= ?
        GROUP BY t.id
        ORDER BY playCount DESC, MAX(ph.played_at) DESC
        LIMIT 30
      `)
      .all(userId, userId, since) as (SongRow & { playCount: number })[];

    reply.send({
      songs: rows.map((r) => ({ ...toJson(songAttrs(r)), playCount: r.playCount })),
    });
  });

  // GET /api/v1/history/rediscover — never-played tracks first, then the ones
  // played longest ago, restricted to tracks that have been in the library
  // long enough to have had a fair chance to be played.
  app.get('/rediscover', async (req: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const userId = req.subsonicUser!.id;
    const cutoff = Math.floor(Date.now() / 1000) - MIN_LIBRARY_AGE_S;

    const rows = db
      .prepare(`
        SELECT ${SONG_SELECT_LIST}
        ${SONG_FROM}
        LEFT JOIN play_history ph ON ph.track_id = t.id AND ph.user_id = ?
        WHERE t.added_at <= ?
        GROUP BY t.id
        ORDER BY COALESCE(MAX(ph.played_at), 0) ASC, t.added_at ASC
        LIMIT 10
      `)
      .all(userId, userId, cutoff) as SongRow[];

    reply.send({ songs: rows.map((r) => toJson(songAttrs(r))) });
  });
}
