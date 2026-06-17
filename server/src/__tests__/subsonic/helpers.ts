import { createHash } from 'crypto';
import type Database from 'better-sqlite3';

/** Seed a minimal library into an in-memory DB for endpoint tests. */
export function seedLibrary(db: Database.Database): {
  artistId: number;
  albumId: number;
  trackId: number;
} {
  const artistId = Number(
    db.prepare("INSERT INTO artists (name) VALUES ('Test Artist')").run().lastInsertRowid,
  );
  const albumId = Number(
    db.prepare('INSERT INTO albums (name, artist_id, year) VALUES (?, ?, 2024)').run('Test Album', artistId).lastInsertRowid,
  );
  const trackId = Number(
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, track_no, duration_s, path, size, format, bitrate)
      VALUES ('Test Track', ?, ?, 1, 210, '/music/test.mp3', 1024000, 'MPEG', 320)
    `).run(albumId, artistId).lastInsertRowid,
  );
  db.prepare("INSERT INTO libraries (name, fs_path) VALUES ('Music', '/music')").run();
  return { artistId, albumId, trackId };
}

/** Build Subsonic auth query string for the default admin/admin user. */
export function authParams(password = 'admin'): string {
  const salt = 'testsalt';
  const token = createHash('md5').update(password + salt).digest('hex');
  return `u=admin&t=${token}&s=${salt}&v=1.16.1&c=test&f=json`;
}
