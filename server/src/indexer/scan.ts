import { readdir, stat } from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';
import type Database from 'better-sqlite3';
import { getDb } from '../db/database.js';

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.ogg',
  '.opus',
  '.aac',
  '.m4a',
  '.mp4',
  '.wav',
  '.aiff',
  '.wv',
  '.ape',
  '.mpc',
]);

export interface ScanResult {
  added: number;
  updated: number;
  skipped: number;
  errors: number;
}

export async function scanLibrary(libraryPath: string): Promise<ScanResult> {
  const db = getDb();
  const result: ScanResult = { added: 0, updated: 0, skipped: 0, errors: 0 };
  await walkDir(db, libraryPath, result);
  return result;
}

async function walkDir(db: Database.Database, dir: string, result: ScanResult): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — skip silently
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(db, fullPath, result);
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      await processFile(db, fullPath, result);
    }
  }
}

async function processFile(
  db: Database.Database,
  filePath: string,
  result: ScanResult,
): Promise<void> {
  try {
    const fileStats = await stat(filePath);
    const mtime = fileStats.mtimeMs;

    const existing = db
      .prepare('SELECT id, mtime FROM tracks WHERE path = ?')
      .get(filePath) as { id: number; mtime: number | null } | undefined;

    if (existing?.mtime === mtime) {
      result.skipped++;
      return;
    }

    // skipCovers: true avoids loading large embedded art into memory during a scan
    const meta = await parseFile(filePath, { duration: true, skipCovers: true });
    const { common, format } = meta;

    const artistName = common.artist ?? common.albumartist ?? 'Unknown Artist';
    const albumName = common.album ?? 'Unknown Album';
    const title = common.title ?? path.basename(filePath, path.extname(filePath));

    const artistId = upsertArtist(db, artistName);
    const albumMbid = common.musicbrainz_albumid ?? null;
    const albumId = upsertAlbum(db, albumName, artistId, common.year ?? null, albumMbid);

    const fields = {
      title,
      album_id: albumId,
      artist_id: artistId,
      disc_no: common.disk?.no ?? null,
      track_no: common.track?.no ?? null,
      duration_s: format.duration ?? null,
      size: fileStats.size,
      mtime,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      format: format.container ?? null,
      sample_rate: format.sampleRate ?? null,
      replaygain_track: common.replaygain_track_gain?.dB ?? null,
      replaygain_album: common.replaygain_album_gain?.dB ?? null,
      mbid: common.musicbrainz_recordingid ?? null,
    };

    if (existing) {
      db.prepare(`
        UPDATE tracks SET
          title = :title, album_id = :album_id, artist_id = :artist_id,
          disc_no = :disc_no, track_no = :track_no, duration_s = :duration_s,
          size = :size, mtime = :mtime, bitrate = :bitrate, format = :format,
          sample_rate = :sample_rate, replaygain_track = :replaygain_track,
          replaygain_album = :replaygain_album, mbid = :mbid
        WHERE path = :path
      `).run({ ...fields, path: filePath });
      result.updated++;
    } else {
      db.prepare(`
        INSERT INTO tracks
          (title, album_id, artist_id, disc_no, track_no, duration_s,
           path, size, mtime, bitrate, format, sample_rate,
           replaygain_track, replaygain_album, mbid)
        VALUES
          (:title, :album_id, :artist_id, :disc_no, :track_no, :duration_s,
           :path, :size, :mtime, :bitrate, :format, :sample_rate,
           :replaygain_track, :replaygain_album, :mbid)
      `).run({ ...fields, path: filePath });
      result.added++;
    }
  } catch (err) {
    console.error(`[indexer] Error processing ${filePath}:`, err);
    result.errors++;
  }
}

export function upsertArtist(db: Database.Database, name: string): number {
  const row = db
    .prepare('SELECT id FROM artists WHERE name = ? COLLATE NOCASE')
    .get(name) as { id: number } | undefined;
  if (row) return row.id;
  return Number(db.prepare('INSERT INTO artists (name) VALUES (?)').run(name).lastInsertRowid);
}

export function upsertAlbum(
  db: Database.Database,
  name: string,
  artistId: number,
  year: number | null,
  mbid?: string | null,
): number {
  const row = db
    .prepare('SELECT id FROM albums WHERE name = ? COLLATE NOCASE AND artist_id = ?')
    .get(name, artistId) as { id: number } | undefined;
  if (row) {
    // Update mbid if we now have one and didn't before
    if (mbid) db.prepare('UPDATE albums SET mbid = ? WHERE id = ? AND mbid IS NULL').run(mbid, row.id);
    return row.id;
  }
  return Number(
    db
      .prepare('INSERT INTO albums (name, artist_id, year, mbid) VALUES (?, ?, ?, ?)')
      .run(name, artistId, year, mbid ?? null).lastInsertRowid,
  );
}
