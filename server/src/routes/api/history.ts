import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../../db/database.js';
import { songAttrs, toJson, type SongRow } from '../subsonic/serialize.js';
import { SONG_SELECT_LIST, SONG_FROM } from '../subsonic/endpoints/browse.js';

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

export async function historyPlugin(app: FastifyInstance): Promise<void> {
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
}
