/**
 * Fire-and-forget external scrobbling to Last.fm and ListenBrainz.
 * Called after a play is confirmed (submission=true scrobble or stream start).
 */
import { createHash } from 'crypto';
import { getDb } from './db/database.js';

interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  duration_s: number | null;
}

function getTrackMeta(trackId: number): TrackMeta | null {
  return getDb()
    .prepare(`
      SELECT t.title, ar.name AS artist, al.name AS album, t.duration_s
      FROM tracks t
      JOIN artists ar ON ar.id = t.artist_id
      JOIN albums al ON al.id = t.album_id
      WHERE t.id = ?
    `)
    .get(trackId) as TrackMeta | null;
}

function getUserPrefs(userId: number): {
  lastfm_session_key: string | null;
  listenbrainz_token: string | null;
} | null {
  return getDb()
    .prepare('SELECT lastfm_session_key, listenbrainz_token FROM user_preferences WHERE user_id = ?')
    .get(userId) as {
      lastfm_session_key: string | null;
      listenbrainz_token: string | null;
    } | null;
}

function getSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// ── Last.fm ───────────────────────────────────────────────────────────────────

/** Exported for tests only — Last.fm's request-signing algorithm (sorted
 * param concatenation + secret, md5'd) is the one piece of scrobbling logic
 * that's pure and worth asserting on directly rather than only indirectly
 * via a mocked fetch call. */
export function lfmSign(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params).sort();
  const str = sorted.map((k) => k + params[k]).join('') + secret;
  return createHash('md5').update(str, 'utf8').digest('hex');
}

async function scrobbleLastFm(
  meta: TrackMeta,
  timestamp: number,
  sessionKey: string,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  const params: Record<string, string> = {
    method: 'track.scrobble',
    api_key: apiKey,
    sk: sessionKey,
    artist: meta.artist,
    track: meta.title,
    album: meta.album,
    timestamp: String(timestamp),
  };
  params.api_sig = lfmSign(params, apiSecret);
  params.format = 'json';

  const body = new URLSearchParams(params);
  await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(8000),
  });
}

// ── ListenBrainz ─────────────────────────────────────────────────────────────

async function scrobbleListenBrainz(
  meta: TrackMeta,
  timestamp: number,
  token: string,
): Promise<void> {
  await fetch('https://api.listenbrainz.org/1/submit-listens', {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      listen_type: 'single',
      payload: [{
        listened_at: timestamp,
        track_metadata: {
          artist_name: meta.artist,
          track_name: meta.title,
          release_name: meta.album,
          additional_info: {
            duration_ms: meta.duration_s ? Math.round(meta.duration_s * 1000) : undefined,
            media_player: 'Cadence',
          },
        },
      }],
    }),
    signal: AbortSignal.timeout(8000),
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function fireExternalScrobbles(
  userId: number,
  trackId: number,
  playedAt: number,
): void {
  // Fully async fire-and-forget — never throws into caller
  Promise.resolve().then(async () => {
    const meta = getTrackMeta(trackId);
    if (!meta) return;

    const prefs = getUserPrefs(userId);
    if (!prefs) return;

    const lfmEnabled = getSetting('lastfm_enabled') === 'true';
    const lfmApiKey = getSetting('lastfm_api_key');
    const lfmApiSecret = getSetting('lastfm_api_secret');

    if (lfmEnabled && lfmApiKey && lfmApiSecret && prefs.lastfm_session_key) {
      scrobbleLastFm(meta, playedAt, prefs.lastfm_session_key, lfmApiKey, lfmApiSecret).catch(
        () => {/* best-effort */},
      );
    }

    if (prefs.listenbrainz_token) {
      scrobbleListenBrainz(meta, playedAt, prefs.listenbrainz_token).catch(
        () => {/* best-effort */},
      );
    }
  }).catch(() => {/* never throw */});
}
