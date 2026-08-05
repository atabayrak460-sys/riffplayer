import { createHash } from 'crypto';
import type Database from 'better-sqlite3';

/** Draws from the same shared artists/albums/tracks id counter the real
 * indexer uses (migration 009) — mirrored here rather than imported so this
 * fixture stays independent of indexer internals. Using it (instead of raw
 * per-table AUTOINCREMENT) is what gives every seeded fixture a distinct
 * artistId/albumId/trackId, matching what a real scanned library looks
 * like; a previous version of this helper let all three collide at 1. */
function nextId(db: Database.Database): number {
  const row = db
    .prepare('UPDATE id_sequence SET next_id = next_id + 1 WHERE id = 1 RETURNING next_id - 1 AS id')
    .get() as { id: number };
  return row.id;
}

/** Seed a minimal library into an in-memory DB for endpoint tests. */
export function seedLibrary(db: Database.Database): {
  artistId: number;
  albumId: number;
  trackId: number;
} {
  const artistId = nextId(db);
  db.prepare('INSERT INTO artists (id, name) VALUES (?, ?)').run(artistId, 'Test Artist');
  const albumId = nextId(db);
  db.prepare('INSERT INTO albums (id, name, artist_id, year) VALUES (?, ?, ?, 2024)')
    .run(albumId, 'Test Album', artistId);
  const trackId = nextId(db);
  db.prepare(`
    INSERT INTO tracks (id, title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
    VALUES (?, 'Test Track', ?, ?, 1, 210, '/music/test.mp3', 1024000, 'MPEG', 320)
  `).run(trackId, albumId, artistId);
  db.prepare("INSERT INTO libraries (name, fs_path) VALUES ('Music', '/music')").run();
  return { artistId, albumId, trackId };
}

/** Build Subsonic auth query string for the default admin/admin user. */
export function authParams(password = 'admin'): string {
  const salt = 'testsalt';
  const token = createHash('md5').update(password + salt).digest('hex');
  return `u=admin&t=${token}&s=${salt}&v=1.16.1&c=test&f=json`;
}
