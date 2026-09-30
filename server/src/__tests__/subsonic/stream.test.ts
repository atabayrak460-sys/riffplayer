import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm } from 'fs/promises';
import { writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from './helpers.js';

// Minimal valid WAV (44-byte header, 0 samples, 44100 Hz mono 16-bit PCM)
function writeWav(p: string): void {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36, 4);
  b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);  b.writeUInt16LE(1, 20);  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);   b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(0, 40);
  writeFileSync(p, b);
}

// Same header, but with a real (silent) PCM payload — ffmpeg refuses to
// produce meaningful output from a zero-sample WAV, and the transcoding
// tests below need to observe an actual successful ffmpeg run.
function writeWavWithAudio(p: string, seconds = 1): void {
  const dataBytes = 44100 * 2 * seconds; // mono, 16-bit
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);  b.writeUInt16LE(1, 20);  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);   b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(dataBytes, 40);
  writeFileSync(p, b); // silent PCM (Buffer.alloc zero-fills) is enough for ffmpeg
}

let app: FastifyInstance;
let tmpDir: string;
let trackId: number;

beforeEach(async () => {
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();

  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'riffplayer-stream-'));
  const wavPath = path.join(tmpDir, 'test.wav');
  writeWav(wavPath);

  const db = getDb();
  const artistId = Number(db.prepare("INSERT INTO artists (name) VALUES ('Artist')").run().lastInsertRowid);
  const albumId  = Number(db.prepare("INSERT INTO albums (name, artist_id) VALUES ('Album', ?)").run(artistId).lastInsertRowid);
  trackId = Number(
    db.prepare(`
      INSERT INTO tracks (title, album_id, artist_id, path, size, format)
      VALUES ('Track', ?, ?, ?, 44, 'WAVE')
    `).run(albumId, artistId, wavPath).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams();

describe('stream.view', () => {
  it('returns 200 with correct content-type for a WAV file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/wav/);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.rawPayload.length).toBe(44);
  });

  it('returns 206 Partial Content for a range request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=0-9' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-9\/44$/);
    expect(res.headers['content-length']).toBe('10');
    expect(res.rawPayload.length).toBe(10);
  });

  it('returns the correct byte slice for a mid-file range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=10-19' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-length']).toBe('10');
  });

  it('handles open-ended range (bytes=N-)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/rest/stream.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=40-' },
    });
    expect(res.statusCode).toBe(206);
    expect(Number(res.headers['content-length'])).toBe(4); // bytes 40-43
  });

  it('returns Subsonic error for unknown track', async () => {
    const res = await app.inject({ url: `/rest/stream.view?${auth}&id=99999` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });

  it('returns Subsonic error when file is missing from disk', async () => {
    getDb().prepare('UPDATE tracks SET path = ? WHERE id = ?').run('/nonexistent/file.wav', trackId);
    const res = await app.inject({ url: `/rest/stream.view?${auth}&id=${trackId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
  });
});

describe('download.view', () => {
  it('serves the file with Content-Disposition attachment', async () => {
    const res = await app.inject({
      url: `/rest/download.view?${auth}&id=${trackId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/test\.wav/);
    expect(res.rawPayload.length).toBe(44);
  });

  it('supports range requests on download too', async () => {
    const res = await app.inject({
      url: `/rest/download.view?${auth}&id=${trackId}`,
      headers: { range: 'bytes=0-3' },
    });
    expect(res.statusCode).toBe(206);
  });

  // Regression test: found live — downloading a playlist whose tracks live
  // at a path containing Turkish characters 500'd with a raw Node
  // `ERR_INVALID_CHAR` (Node's header setter only accepts Latin-1 bytes),
  // aborting the whole playlist download over one track.
  it('serves a file whose path contains non-ASCII characters instead of 500ing', async () => {
    const unicodeDir = path.join(tmpDir, 'Müzik');
    await mkdir(unicodeDir, { recursive: true });
    const unicodePath = path.join(unicodeDir, 'şarkı adı.wav');
    writeWav(unicodePath);
    const unicodeTrackId = Number(
      getDb().prepare(`
        INSERT INTO tracks (title, album_id, artist_id, path, size, format)
        VALUES ('şarkı adı', (SELECT album_id FROM tracks WHERE id = ?), (SELECT artist_id FROM tracks WHERE id = ?), ?, 44, 'WAVE')
      `).run(trackId, trackId, unicodePath).lastInsertRowid,
    );

    const res = await app.inject({
      url: `/rest/download.view?${auth}&id=${unicodeTrackId}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBe(44);
    // Sanitized ASCII fallback, plus the real name in the RFC 6266
    // extended form — never the raw Unicode bytes as a literal header
    // value (that's exactly what Node's setHeader rejects).
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="/);
    expect(res.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('şarkı adı.wav')}`,
    );
  });
});

// Exercises the real ffmpeg binary rather than mocking child_process — this
// is the only way to actually verify the constructed -f/-b:a/-af arguments
// are valid ffmpeg syntax, not just that stream.ts *tried* to build them.
describe('stream.view — transcoding (needsTranscode)', () => {
  let audioTrackId: number;

  beforeEach(() => {
    const wavPath = path.join(tmpDir, 'audio.wav');
    writeWavWithAudio(wavPath);
    audioTrackId = Number(
      getDb().prepare(`
        INSERT INTO tracks (title, album_id, artist_id, path, size, format, bitrate)
        VALUES ('Audio Track', (SELECT album_id FROM tracks WHERE id = ?), (SELECT artist_id FROM tracks WHERE id = ?), ?, 176444, 'WAVE', 1411)
      `).run(trackId, trackId, wavPath).lastInsertRowid,
    );
  });

  it('transcodes when the requested format differs from the native format', async () => {
    const res = await app.inject({
      url: `/rest/stream.view?${auth}&id=${audioTrackId}&format=mp3`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.rawPayload.length).toBeGreaterThan(0);
  }, 15000);

  it('does not transcode when the requested format matches the native format and no bitrate cap applies', async () => {
    const res = await app.inject({
      url: `/rest/stream.view?${auth}&id=${audioTrackId}&format=wav`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio\/wav/);
    // Only the direct-serve path sets Accept-Ranges — proof ffmpeg was never invoked.
    expect(res.headers['accept-ranges']).toBe('bytes');
  });

  it('transcodes when the track bitrate exceeds the requested maxBitRate, even with no format specified', async () => {
    const res = await app.inject({
      url: `/rest/stream.view?${auth}&id=${audioTrackId}&maxBitRate=128`,
    });
    expect(res.statusCode).toBe(200);
    // No format requested and native isn't 'raw', so serveTranscoded defaults to mp3.
    expect(res.headers['content-type']).toBe('audio/mpeg');
  }, 15000);

  it('does not transcode when maxBitRate is above the track bitrate', async () => {
    const res = await app.inject({
      url: `/rest/stream.view?${auth}&id=${audioTrackId}&maxBitRate=1411`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes'); // direct-serve, not transcoded
  });

  it('falls back to the user\'s saved transcode preference when the client sends no format', async () => {
    const userId = (getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id;
    getDb().prepare('INSERT INTO user_preferences (user_id, transcode_format) VALUES (?, ?)').run(userId, 'mp3');

    const res = await app.inject({ url: `/rest/stream.view?${auth}&id=${audioTrackId}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
  }, 15000);

  it('succeeds when transcoding a track with a ReplayGain value (volume filter applied)', async () => {
    getDb().prepare('UPDATE tracks SET replaygain_track = ? WHERE id = ?').run(-6.5, audioTrackId);

    const res = await app.inject({
      url: `/rest/stream.view?${auth}&id=${audioTrackId}&format=mp3`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBeGreaterThan(0);
  }, 15000);

  it('returns a clean 500 rather than hanging or crashing when ffmpeg is not installed', async () => {
    const realPath = process.env.PATH;
    process.env.PATH = ''; // hide ffmpeg from spawn('ffmpeg', ...)'s lookup
    try {
      const res = await app.inject({
        url: `/rest/stream.view?${auth}&id=${audioTrackId}&format=mp3`,
      });
      // spawn('ffmpeg', ...) fails with ENOENT; the ff.on('error', ...)
      // handler in stream.ts catches it and replies 500 before Fastify has
      // committed the streamed response, rather than hanging the request or
      // crashing the server.
      expect(res.statusCode).toBe(500);
      expect(res.body).toContain('Transcoding unavailable');
    } finally {
      process.env.PATH = realPath;
    }
  }, 15000);
});
