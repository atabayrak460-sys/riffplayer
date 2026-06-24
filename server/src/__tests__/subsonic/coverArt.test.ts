import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from './helpers.js';

// Minimal 1×1 red PNG (valid file so createReadStream doesn't fail)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
  '77533d0000000c4944415408d7636068f8cf0000000200019e221bc60000' +
  '00004945444ae426082',
  'hex',
);

// Minimal valid WAV (44-byte header, 0 data samples)
function writeWav(filePath: string): void {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36, 4);
  b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(0, 40);
  writeFileSync(filePath, b);
}

let app: FastifyInstance;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cadence-covers-'));
  process.env.COVERS_DIR = path.join(tmpDir, 'cache');
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
});

afterEach(async () => {
  delete process.env.COVERS_DIR;
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams();

describe('getCoverArt.view — errors', () => {
  it('returns MISSING_PARAM when id is absent', async () => {
    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(10);
  });

  it('returns DATA_NOT_FOUND for unknown album id', async () => {
    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-99999` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });

  it('returns DATA_NOT_FOUND for unknown artist id', async () => {
    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=ar-99999` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });
});

describe('getCoverArt.view — album cover_path', () => {
  it('serves the image from cover_path with correct MIME', async () => {
    const coverFile = path.join(tmpDir, 'cover.png');
    await writeFile(coverFile, TINY_PNG);

    const db = getDb();
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('A')").run().lastInsertRowid,
    );
    const albumId = Number(
      db.prepare('INSERT INTO albums (name, artist_id, cover_path) VALUES (?, ?, ?)')
        .run('Album', artistId, coverFile).lastInsertRowid,
    );

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });

  it('serves album art via plain numeric id (al- prefix omitted)', async () => {
    const coverFile = path.join(tmpDir, 'cover.png');
    await writeFile(coverFile, TINY_PNG);

    const db = getDb();
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('B')").run().lastInsertRowid,
    );
    const albumId = Number(
      db.prepare('INSERT INTO albums (name, artist_id, cover_path) VALUES (?, ?, ?)')
        .run('Album2', artistId, coverFile).lastInsertRowid,
    );

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=${albumId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });
});

describe('getCoverArt.view — embedded art extraction', () => {
  it('returns DATA_NOT_FOUND when WAV has no embedded art', async () => {
    const wavPath = path.join(tmpDir, 'bare.wav');
    writeWav(wavPath);

    const db = getDb();
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('C')").run().lastInsertRowid,
    );
    const albumId = Number(
      db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').run('Album3', artistId).lastInsertRowid,
    );
    db.prepare('INSERT INTO tracks (title, album_id, artist_id, path) VALUES (?, ?, ?, ?)')
      .run('Track', albumId, artistId, wavPath);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });

  it('returns DATA_NOT_FOUND when album has no tracks', async () => {
    const db = getDb();
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('D')").run().lastInsertRowid,
    );
    const albumId = Number(
      db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').run('Album4', artistId).lastInsertRowid,
    );

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });

  it('serves cached art on second request (covers dir populated)', async () => {
    const cacheDir = process.env.COVERS_DIR!;
    await mkdir(cacheDir, { recursive: true });
    const cachedCover = path.join(cacheDir, 'al-1.jpg');
    await writeFile(cachedCover, TINY_PNG);

    const db = getDb();
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('E')").run().lastInsertRowid,
    );
    // albumId will be 1 since in-memory DB
    db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').run('Album5', artistId);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-1` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
  });
});

describe('getCoverArt.view — artist image', () => {
  it('serves artist image with correct MIME', async () => {
    const imgFile = path.join(tmpDir, 'artist.jpg');
    await writeFile(imgFile, TINY_PNG);

    const db = getDb();
    const artistId = Number(
      db.prepare('INSERT INTO artists (name, image_path) VALUES (?, ?)').run('Artist', imgFile).lastInsertRowid,
    );

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=ar-${artistId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
  });

  it('returns DATA_NOT_FOUND for artist with no image_path', async () => {
    const db = getDb();
    const artistId = Number(
      db.prepare("INSERT INTO artists (name) VALUES ('NoImg')").run().lastInsertRowid,
    );

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=ar-${artistId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });
});
