import { getDb } from '../db/database.js';

export interface WrappedStats {
  year: number;
  totalPlays: number;
  totalMinutes: number;
  topTracks: {
    id: string;
    title: string;
    artist: string;
    artistId: string;
    album: string;
    albumId: string;
    coverArt: string;
    playCount: number;
  }[];
  topArtists: {
    id: string;
    name: string;
    coverArt: string | null;
    playCount: number;
  }[];
  topAlbums: {
    id: string;
    name: string;
    artist: string;
    coverArt: string;
    playCount: number;
  }[];
  byMonth: { month: number; plays: number }[];
}

function yearBounds(year: number): [number, number] {
  const start = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
  const end = Math.floor(new Date(`${year + 1}-01-01T00:00:00Z`).getTime() / 1000);
  return [start, end];
}

export function getWrappedStats(userId: number, year: number): WrappedStats {
  const db = getDb();
  const [start, end] = yearBounds(year);

  const totalRow = db
    .prepare(`
      SELECT COUNT(*) AS plays,
             COALESCE(SUM(t.duration_s), 0) AS secs
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id
      WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
    `)
    .get(userId, start, end) as { plays: number; secs: number };

  const topTracks = db
    .prepare(`
      SELECT t.id, t.title, ar.id AS artist_id, ar.name AS artist,
             al.id AS album_id, al.name AS album, al.id AS cover_album_id,
             COUNT(ph.id) AS play_count
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id
      JOIN artists ar ON ar.id = t.artist_id
      JOIN albums al ON al.id = t.album_id
      WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
      GROUP BY t.id
      ORDER BY play_count DESC
      LIMIT 10
    `)
    .all(userId, start, end) as {
      id: number;
      title: string;
      artist_id: number;
      artist: string;
      album_id: number;
      album: string;
      cover_album_id: number;
      play_count: number;
    }[];

  const topArtists = db
    .prepare(`
      SELECT ar.id, ar.name, ar.image_path,
             COUNT(ph.id) AS play_count
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id
      JOIN artists ar ON ar.id = t.artist_id
      WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
      GROUP BY ar.id
      ORDER BY play_count DESC
      LIMIT 10
    `)
    .all(userId, start, end) as {
      id: number;
      name: string;
      image_path: string | null;
      play_count: number;
    }[];

  const topAlbums = db
    .prepare(`
      SELECT al.id, al.name, ar.name AS artist,
             COUNT(ph.id) AS play_count
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id
      JOIN albums al ON al.id = t.album_id
      JOIN artists ar ON ar.id = al.artist_id
      WHERE ph.user_id = ? AND ph.played_at >= ? AND ph.played_at < ?
      GROUP BY al.id
      ORDER BY play_count DESC
      LIMIT 10
    `)
    .all(userId, start, end) as {
      id: number;
      name: string;
      artist: string;
      play_count: number;
    }[];

  const byMonth = db
    .prepare(`
      SELECT CAST(strftime('%m', datetime(played_at, 'unixepoch')) AS INTEGER) AS month,
             COUNT(*) AS plays
      FROM play_history
      WHERE user_id = ? AND played_at >= ? AND played_at < ?
      GROUP BY month
      ORDER BY month
    `)
    .all(userId, start, end) as { month: number; plays: number }[];

  return {
    year,
    totalPlays: totalRow.plays,
    totalMinutes: Math.round(totalRow.secs / 60),
    topTracks: topTracks.map((t) => ({
      id: String(t.id),
      title: t.title,
      artist: t.artist,
      artistId: String(t.artist_id),
      album: t.album,
      albumId: String(t.album_id),
      coverArt: `al-${t.album_id}`,
      playCount: t.play_count,
    })),
    topArtists: topArtists.map((a) => ({
      id: String(a.id),
      name: a.name,
      coverArt: a.image_path ? `ar-${a.id}` : null,
      playCount: a.play_count,
    })),
    topAlbums: topAlbums.map((a) => ({
      id: String(a.id),
      name: a.name,
      artist: a.artist,
      coverArt: `al-${a.id}`,
      playCount: a.play_count,
    })),
    byMonth,
  };
}
