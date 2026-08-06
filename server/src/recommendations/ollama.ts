/**
 * Ollama-based local AI recommendations and Wrapped narrative summary.
 *
 * HARD RULES (per ARCHITECTURE.md):
 *   1. The LLM prompt explicitly forbids outputting URLs or acquisition paths.
 *   2. Only tracks already in the local library are returned to clients.
 *   3. Unmatched suggestions are silently dropped — the user cannot obtain them
 *      through Cadence.
 *   4. No data leaves the user's server; Ollama runs locally.
 */
import { getDb } from '../db/database.js';
import { escapeLike } from '../db/likeEscape.js';
import { getUserTopArtists } from './lastfm.js';
import { TtlCache } from './ttlCache.js';

interface OllamaChatResponse {
  message?: { content: string };
  response?: string; // /api/generate fallback
}

async function callOllama(
  ollamaUrl: string,
  model: string,
  prompt: string,
): Promise<string> {
  const base = ollamaUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = (await res.json()) as OllamaChatResponse;
  return data.message?.content ?? data.response ?? '';
}

/** Parse "Artist Name - Track Name" lines from LLM output. Exported for tests. */
export function parseNamePairs(text: string): Array<{ artist: string; track: string }> {
  return text
    .split('\n')
    .map((l) => l.replace(/^\d+\.\s*/, '').trim()) // strip leading numbers
    .filter((l) => l.includes(' - '))
    .map((l) => {
      const [artist, ...rest] = l.split(' - ');
      return { artist: artist.trim(), track: rest.join(' - ').trim() };
    })
    .filter((p) => p.artist && p.track);
}

function findLocalMatch(artist: string, track: string) {
  return getDb()
    .prepare(`
      SELECT t.id, t.title, t.track_no, t.disc_no, t.duration_s, t.size, t.bitrate,
             t.format, t.path, t.added_at, t.album_id, t.artist_id,
             t.replaygain_track, t.replaygain_album,
             ar.name AS artist_name, al.name AS album_name, al.year,
             NULL AS starred
      FROM tracks t
      JOIN artists ar ON ar.id = t.artist_id
      JOIN albums al ON al.id = t.album_id
      WHERE ar.name LIKE ? ESCAPE '\\' AND t.title LIKE ? ESCAPE '\\'
      LIMIT 1
    `)
    .get(`%${escapeLike(artist)}%`, `%${escapeLike(track)}%`);
}

function getUserTopTracks(userId: number, limitDays = 90, count = 10) {
  const since = Math.floor(Date.now() / 1000) - limitDays * 86400;
  return getDb()
    .prepare(`
      SELECT t.title, ar.name AS artist
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id
      JOIN artists ar ON ar.id = t.artist_id
      WHERE ph.user_id = ? AND ph.played_at >= ?
      GROUP BY t.id
      ORDER BY COUNT(ph.id) DESC
      LIMIT ?
    `)
    .all(userId, since, count) as { title: string; artist: string }[];
}

// Capped at 500 entries — see ttlCache.ts. ollamaUrl/model are folded into
// the key (unlike lastfm's API key, these aren't secret, so no need to
// hash them) so changing either invalidates stale cached results
// immediately instead of serving them for up to the full TTL.
const _ollamaCache = new TtlCache<unknown[]>(24 * 60 * 60 * 1000, 500);

export async function getOllamaRecommendations(
  userId: number,
  ollamaUrl: string,
  model: string,
): Promise<unknown[]> {
  const key = `ollama:${userId}:${ollamaUrl}:${model}`;
  const cached = _ollamaCache.get(key);
  if (cached) return cached;

  const topArtists = getUserTopArtists(userId, 90, 10).map((a) => a.name);
  const topTracks = getUserTopTracks(userId, 90, 10).map(
    (t) => `${t.artist} - ${t.title}`,
  );

  if (!topArtists.length) return [];

  const prompt = `You are a music recommendation engine for a self-hosted music server.
The user listens to: ${topArtists.slice(0, 8).join(', ')}.
Their favourite tracks include: ${topTracks.slice(0, 5).join(', ')}.

Suggest 20 tracks to discover. IMPORTANT RULES:
- Output ONLY in the format: Artist Name - Track Name (one per line)
- Do NOT include any URLs, streaming links, download links, or sources to obtain music
- Do NOT include commentary, explanations, or numbering
- Suggest artists and tracks that are stylistically similar to the above`;

  const raw = await callOllama(ollamaUrl, model, prompt);
  const pairs = parseNamePairs(raw);

  const songs: unknown[] = [];
  const seen = new Set<number>();
  for (const { artist, track } of pairs) {
    const match = findLocalMatch(artist, track) as { id: number } | undefined;
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      songs.push(match);
    }
  }

  _ollamaCache.set(key, songs);
  return songs;
}

export async function generateWrappedSummary(
  stats: {
    year: number;
    totalPlays: number;
    totalMinutes: number;
    topArtists: { name: string; playCount: number }[];
    topTracks: { title: string; artist: string; playCount: number }[];
  },
  ollamaUrl: string,
  model: string,
): Promise<string> {
  const prompt = `Write a short, personal year-in-music recap for a music listener.
Their stats for ${stats.year}:
- Total plays: ${stats.totalPlays}
- Total listening time: ${Math.round(stats.totalMinutes / 60)} hours
- Top artists: ${stats.topArtists.slice(0, 5).map((a) => `${a.name} (${a.playCount} plays)`).join(', ')}
- Top tracks: ${stats.topTracks.slice(0, 3).map((t) => `"${t.title}" by ${t.artist}`).join(', ')}

Write 2-3 warm, personal sentences celebrating their year in music.
Do NOT mention any streaming services, links, or ways to acquire music.
Keep it positive and specific to their data.`;

  return callOllama(ollamaUrl, model, prompt);
}
