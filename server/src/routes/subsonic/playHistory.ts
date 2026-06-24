import { getDb } from '../../db/database.js';

/**
 * Insert a play event into play_history.
 * playedAtMs is the client-reported UTC timestamp in milliseconds (Subsonic `time` param).
 * When omitted the DB default (current unixepoch) is used.
 */
export function logPlay(
  userId: number,
  trackId: number,
  client: string | null | undefined,
  playedAtMs?: number,
): void {
  const db = getDb();
  if (playedAtMs != null) {
    db.prepare(
      'INSERT INTO play_history (user_id, track_id, client, played_at) VALUES (?, ?, ?, ?)',
    ).run(userId, trackId, client ?? null, Math.floor(playedAtMs / 1000));
  } else {
    db.prepare(
      'INSERT INTO play_history (user_id, track_id, client) VALUES (?, ?, ?)',
    ).run(userId, trackId, client ?? null);
  }
}
