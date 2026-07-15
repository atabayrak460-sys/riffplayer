import { getDb } from '../../db/database.js';

// Fallback dedupe window when a track has no known duration.
const DEFAULT_DEDUPE_WINDOW_S = 240;

/**
 * Insert a play event into play_history — unless one was already logged for
 * the same user+track within that track's own duration (or a default
 * window, if duration is unknown).
 *
 * A single real listen currently reaches this function from more than one
 * place: `stream.view` logs unconditionally the moment playback starts, and
 * `scrobble.view` logs again when the client reports submission=true after
 * its listening threshold — both for the very same play. Browsers can also
 * issue more than one `stream.view` request for one playback (HTTP range
 * requests on seek/buffer). Collapsing anything within one track-length of
 * the previous log turns all of that into a single row per actual listen,
 * while a genuine replay — which happens after the track has finished —
 * still logs as a new play.
 *
 * playedAtMs is the client-reported UTC timestamp in milliseconds (Subsonic
 * `time` param). When omitted, the current time is used.
 */
export function logPlay(
  userId: number,
  trackId: number,
  client: string | null | undefined,
  playedAtMs?: number,
): void {
  const db = getDb();
  const playedAt = playedAtMs != null ? Math.floor(playedAtMs / 1000) : Math.floor(Date.now() / 1000);

  const track = db
    .prepare('SELECT duration_s FROM tracks WHERE id = ?')
    .get(trackId) as { duration_s: number | null } | undefined;
  const windowS = track?.duration_s ?? DEFAULT_DEDUPE_WINDOW_S;

  const recent = db
    .prepare('SELECT 1 FROM play_history WHERE user_id = ? AND track_id = ? AND played_at >= ? LIMIT 1')
    .get(userId, trackId, playedAt - windowS);
  if (recent) return;

  db.prepare(
    'INSERT INTO play_history (user_id, track_id, client, played_at) VALUES (?, ?, ?, ?)',
  ).run(userId, trackId, client ?? null, playedAt);
}
