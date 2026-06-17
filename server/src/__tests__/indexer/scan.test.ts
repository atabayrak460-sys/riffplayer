import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, utimes } from 'fs/promises';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { initDb, closeDb } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { scanLibrary, upsertArtist, upsertAlbum } from '../../indexer/scan.js';
import type Database from 'better-sqlite3';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid WAV file (44-byte header, no audio data). */
function writeWav(filePath: string): void {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // 1 channel
  buf.writeUInt32LE(44100, 24); // sample rate
  buf.writeUInt32LE(88200, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(0, 40);
  writeFileSync(filePath, buf);
}

const MIGRATIONS_DIR = new URL('../../../migrations', import.meta.url).pathname;

// ── fixtures ─────────────────────────────────────────────────────────────────

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  db = initDb(':memory:');
  await runMigrations(db, MIGRATIONS_DIR);
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cadence-test-'));
});

afterEach(async () => {
  closeDb();
  await rm(tmpDir, { recursive: true });
});

// ── upsert helpers ────────────────────────────────────────────────────────────

describe('upsertArtist', () => {
  it('creates an artist and returns its id', () => {
    const id = upsertArtist(db, 'Radiohead');
    expect(id).toBeGreaterThan(0);
  });

  it('returns the same id on repeated calls (case-insensitive)', () => {
    const a = upsertArtist(db, 'Radiohead');
    const b = upsertArtist(db, 'RADIOHEAD');
    expect(a).toBe(b);
  });
});

describe('upsertAlbum', () => {
  it('creates an album under the right artist', () => {
    const artistId = upsertArtist(db, 'Radiohead');
    const id = upsertAlbum(db, 'OK Computer', artistId, 1997);
    expect(id).toBeGreaterThan(0);

    const row = db.prepare('SELECT year FROM albums WHERE id = ?').get(id) as { year: number };
    expect(row.year).toBe(1997);
  });

  it('returns the same id for the same album/artist pair', () => {
    const artistId = upsertArtist(db, 'Radiohead');
    const a = upsertAlbum(db, 'OK Computer', artistId, 1997);
    const b = upsertAlbum(db, 'OK Computer', artistId, 1997);
    expect(a).toBe(b);
  });

  it('creates separate albums for different artists with the same name', () => {
    const r = upsertArtist(db, 'Radiohead');
    const b = upsertArtist(db, 'Blur');
    const idR = upsertAlbum(db, 'Self-Titled', r, null);
    const idB = upsertAlbum(db, 'Self-Titled', b, null);
    expect(idR).not.toBe(idB);
  });
});

// ── full scan ─────────────────────────────────────────────────────────────────

describe('scanLibrary', () => {
  it('adds audio files to the DB', async () => {
    writeWav(path.join(tmpDir, 'track.wav'));

    const result = await scanLibrary(tmpDir);

    expect(result.added).toBe(1);
    expect(result.errors).toBe(0);

    const count = (db.prepare('SELECT COUNT(*) as n FROM tracks').get() as { n: number }).n;
    expect(count).toBe(1);
  });

  it('ignores non-audio files', async () => {
    writeFileSync(path.join(tmpDir, 'cover.jpg'), 'not audio');
    writeFileSync(path.join(tmpDir, 'info.txt'), 'not audio');

    const result = await scanLibrary(tmpDir);
    expect(result.added).toBe(0);
  });

  it('recurses into subdirectories', async () => {
    const sub = path.join(tmpDir, 'Artist', 'Album');
    mkdirSync(sub, { recursive: true });
    writeWav(path.join(sub, 'track1.wav'));
    writeWav(path.join(sub, 'track2.wav'));

    const result = await scanLibrary(tmpDir);
    expect(result.added).toBe(2);
  });

  it('skips unchanged files on re-scan (same mtime)', async () => {
    const p = path.join(tmpDir, 'track.wav');
    writeWav(p);

    await scanLibrary(tmpDir);
    const result2 = await scanLibrary(tmpDir);

    expect(result2.added).toBe(0);
    expect(result2.skipped).toBe(1);
  });

  it('re-indexes a file whose mtime changed', async () => {
    const p = path.join(tmpDir, 'track.wav');
    writeWav(p);
    await scanLibrary(tmpDir);

    // Advance mtime by 1 second
    const future = new Date(Date.now() + 1000);
    await utimes(p, future, future);

    const result2 = await scanLibrary(tmpDir);
    expect(result2.updated).toBe(1);
    expect(result2.added).toBe(0);
  });

  it('does not create duplicate artists or albums across scans', async () => {
    writeWav(path.join(tmpDir, 'track.wav'));
    await scanLibrary(tmpDir);
    await scanLibrary(tmpDir);

    const artists = (db.prepare('SELECT COUNT(*) as n FROM artists').get() as { n: number }).n;
    const albums = (db.prepare('SELECT COUNT(*) as n FROM albums').get() as { n: number }).n;
    expect(artists).toBe(1);
    expect(albums).toBe(1);
  });
});
