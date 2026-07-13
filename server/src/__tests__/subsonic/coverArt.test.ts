import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from './helpers.js';

/**
 * Build a minimal ID3v2.3 binary containing a single APIC (attached picture)
 * frame. Music-metadata will parse this and return the picture with the given
 * MIME type string — exactly what the getCoverArt embedded-art path reads.
 */
function buildId3WithApic(mimeType: string, imageData: Buffer): Buffer {
  // APIC frame body
  const apicContent = Buffer.concat([
    Buffer.from([0x00]),                     // text encoding: ISO-8859-1
    Buffer.from(`${mimeType}\x00`, 'ascii'), // MIME type + null terminator
    Buffer.from([0x03]),                     // picture type: Cover (front)
    Buffer.from([0x00]),                     // description: empty + null
    imageData,
  ]);

  // APIC frame = 4-char ID + 4-byte size (plain big-endian in v2.3) + 2-byte flags + content
  const apicFrame = Buffer.allocUnsafe(10 + apicContent.length);
  apicFrame.write('APIC', 0, 'ascii');
  apicFrame.writeUInt32BE(apicContent.length, 4);
  apicFrame.writeUInt16BE(0x0000, 8);
  apicContent.copy(apicFrame, 10);

  // ID3v2.3 header: "ID3" + version(2.3.0) + flags + syncsafe tag-size
  const tagSize = apicFrame.length;
  const id3Header = Buffer.allocUnsafe(10);
  id3Header.write('ID3', 0, 'ascii');
  id3Header[3] = 0x03; id3Header[4] = 0x00; id3Header[5] = 0x00;
  id3Header[6] = (tagSize >> 21) & 0x7f;
  id3Header[7] = (tagSize >> 14) & 0x7f;
  id3Header[8] = (tagSize >> 7)  & 0x7f;
  id3Header[9] =  tagSize        & 0x7f;

  return Buffer.concat([id3Header, apicFrame]);
}

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
    expect(res.rawPayload.length).toBeGreaterThan(0);
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
    expect(res.rawPayload.length).toBeGreaterThan(0);
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
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });
});

describe('getCoverArt.view — embedded art MIME normalisation', () => {
  // Minimal valid JPEG: Start-of-Image + End-of-Image markers only
  const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

  async function insertAlbumWithTrack(name: string, filePath: string): Promise<number> {
    const db = getDb();
    const artistId = Number(
      db.prepare('INSERT INTO artists (name) VALUES (?)').run(name).lastInsertRowid,
    );
    const albumId = Number(
      db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').run(name, artistId).lastInsertRowid,
    );
    db.prepare('INSERT INTO tracks (title, album_id, artist_id, path) VALUES (?, ?, ?, ?)')
      .run('Track', albumId, artistId, filePath);
    return albumId;
  }

  it('serves embedded JPEG tagged as "image/jpg" (the primary bug)', async () => {
    const filePath = path.join(tmpDir, 'jpg-mime.mp3');
    writeFileSync(filePath, buildId3WithApic('image/jpg', tinyJpeg));
    const albumId = await insertAlbumWithTrack('MimeJpg', filePath);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('serves embedded art with uppercase MIME "IMAGE/JPEG"', async () => {
    const filePath = path.join(tmpDir, 'upper-jpeg.mp3');
    writeFileSync(filePath, buildId3WithApic('IMAGE/JPEG', tinyJpeg));
    const albumId = await insertAlbumWithTrack('UpperJpeg', filePath);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('serves embedded PNG tagged as uppercase "IMAGE/PNG"', async () => {
    const filePath = path.join(tmpDir, 'upper-png.mp3');
    writeFileSync(filePath, buildId3WithApic('IMAGE/PNG', TINY_PNG));
    const albumId = await insertAlbumWithTrack('UpperPng', filePath);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('serves embedded art with MIME params "image/jpeg; charset=utf-8"', async () => {
    const filePath = path.join(tmpDir, 'param-jpeg.mp3');
    writeFileSync(filePath, buildId3WithApic('image/jpeg; charset=utf-8', tinyJpeg));
    const albumId = await insertAlbumWithTrack('ParamJpeg', filePath);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=al-${albumId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
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
    expect(res.rawPayload.length).toBeGreaterThan(0);
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

describe('getCoverArt.view — playlist cover', () => {
  it('serves an uploaded playlist cover with correct MIME', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=CoverTest` });
    const plId = (JSON.parse(create.body)['subsonic-response'] as Record<string, Record<string, unknown>>)
      .playlist.id as string;

    const coverFile = path.join(tmpDir, 'playlist-cover.png');
    await writeFile(coverFile, TINY_PNG);
    getDb().prepare('UPDATE playlists SET cover_path = ? WHERE id = ?').run(coverFile, plId);

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=pl-${plId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  });

  it('returns DATA_NOT_FOUND when playlist has no cover uploaded', async () => {
    const create = await app.inject({ url: `/rest/createPlaylist.view?${auth}&name=NoCoverYet` });
    const plId = (JSON.parse(create.body)['subsonic-response'] as Record<string, Record<string, unknown>>)
      .playlist.id as string;

    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=pl-${plId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });

  it('returns DATA_NOT_FOUND for unknown playlist id', async () => {
    const res = await app.inject({ url: `/rest/getCoverArt.view?${auth}&id=pl-99999` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });
});
