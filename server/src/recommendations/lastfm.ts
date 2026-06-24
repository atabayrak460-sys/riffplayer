/**
 * Last.fm-based similar-artist recommendations.
 * Finds the user's top artists from play_history, calls Last.fm getSimilar,
 * then matches returned names against the local library.
 *
 * HARD RULE: only tracks already in the user's library are returned.
 * No external links or acquisition paths are ever provided.
 */
import { getDb } from '../db/database.js';

interface TopArtist {
  name: string;
  play_count: number;
}

interface LocalSong {
  id: number;
  title: string;
  album_id: number;
  album_name: string;
  artist_id: number;
  artist_name: string;
  duration_s: number | null;
  size: number | null;
  bitrate: number | null;
  format: string | null;
  path: string;
  added_at: number;
  starred: number | null;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  replaygain_track: number | null;
  replaygain_album: number | null;
}

export function getUserTopArtists(userId: number, limitDays = 90, count = 5): TopArtist[] {
  const since = Math.floor(Date.now() / 1000) - limitDays * 86400;
  return getDb()
    .prepare(`
      SELECT ar.name, COUNT(ph.id) AS play_count
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id
      JOIN artists ar ON ar.id = t.artist_id
      WHERE ph.user_id = ? AND ph.played_at >= ?
      GROUP BY ar.id
      ORDER BY play_count DESC
      LIMIT ?
    `)
    .all(userId, since, count) as TopArtist[];
}

async function fetchSimilarArtistNames(
  artistName: string,
  apiKey: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    method: 'artist.getSimilar',
    artist: artistName,
    api_key: apiKey,
    format: 'json',
    limit: '10',
  });
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    similarartists?: { artist?: Array<{ name: string }> };
  };
  return (data.similarartists?.artist ?? []).map((a) => a.name);
}

function findLocalTracksByArtistName(artistName: string, limit = 3): LocalSong[] {
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
      WHERE ar.name LIKE ?
      ORDER BY RANDOM()
      LIMIT ?
    `)
    .all(`%${artistName}%`, limit) as LocalSong[];
}

/** In-memory cache: key → { songs, timestamp } */
const _cache = new Map<string, { songs: LocalSong[]; ts: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getCached(key: string): LocalSong[] | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.songs;
}

function setCached(key: string, songs: LocalSong[]): void {
  _cache.set(key, { songs, ts: Date.now() });
}

export async function getLastFmRecommendations(
  userId: number,
  apiKey: string,
): Promise<LocalSong[]> {
  const cacheKey = `lfm:${userId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const topArtists = getUserTopArtists(userId, 90, 5);
  if (!topArtists.length) return [];

  const similarNames = new Set<string>();
  for (const { name } of topArtists) {
    const similar = await fetchSimilarArtistNames(name, apiKey);
    similar.forEach((n) => similarNames.add(n));
  }

  // Exclude artists the user already listens to
  const knownNames = new Set(topArtists.map((a) => a.name.toLowerCase()));
  const candidates = [...similarNames].filter(
    (n) => !knownNames.has(n.toLowerCase()),
  );

  // Find local matches
  const songs: LocalSong[] = [];
  const seen = new Set<number>();
  for (const name of candidates) {
    for (const song of findLocalTracksByArtistName(name, 3)) {
      if (!seen.has(song.id)) { seen.add(song.id); songs.push(song); }
    }
    if (songs.length >= 30) break;
  }

  // Shuffle before caching
  for (let i = songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }

  setCached(cacheKey, songs);
  return songs;
}
