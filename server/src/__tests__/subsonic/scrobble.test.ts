import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from './helpers.js';

function writeWav(filePath: string): void {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36, 4);
  b.write('WAVE', 8, 'ascii'); b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(0, 40);
  writeFileSync(filePath, b);
}

interface PlayRow {
  user_id: number;
  track_id: number;
  client: string | null;
  played_at: number;
}

let app: FastifyInstance;
let tmpDir: string;
let trackId: number;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cadence-scrobble-'));
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();

  const wavPath = path.join(tmpDir, 'track.wav');
  writeWav(wavPath);

  const db = getDb();
  const artistId = Number(db.prepare("INSERT INTO artists (name) VALUES ('A')").run().lastInsertRowid);
  const albumId  = Number(db.prepare("INSERT INTO albums (name, artist_id) VALUES ('B', ?)").run(artistId).lastInsertRowid);
  trackId = Number(
    db.prepare('INSERT INTO tracks (title, album_id, artist_id, path, size) VALUES (?, ?, ?, ?, 44)')
      .run('T', albumId, artistId, wavPath).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams();

function playHistory(): PlayRow[] {
  return getDb().prepare('SELECT * FROM play_history ORDER BY id').all() as PlayRow[];
}

// ── scrobble.view ─────────────────────────────────────────────────────────────

describe('scrobble.view', () => {
  it('returns MISSING_PARAM when id is absent', async () => {
    const res = await app.inject({ url: `/rest/scrobble.view?${auth}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(10);
    expect(playHistory()).toHaveLength(0);
  });

  it('returns DATA_NOT_FOUND for unknown track', async () => {
    const res = await app.inject({ url: `/rest/scrobble.view?${auth}&id=99999` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect((body.error as Record<string, unknown>).code).toBe(70);
    expect(playHistory()).toHaveLength(0);
  });

  it('logs a play on submission=true (default)', async () => {
    const res = await app.inject({ url: `/rest/scrobble.view?${auth}&id=${trackId}` });
    const body = JSON.parse(res.body)['subsonic-response'] as Record<string, unknown>;
    expect(body.status).toBe('ok');

    const rows = playHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].track_id).toBe(trackId);
    expect(rows[0].client).toBe('test'); // from authParams: c=test
  });

  it('stores client-supplied played_at timestamp', async () => {
    const ms = 1_700_000_000_000; // arbitrary past time
    const res = await app.inject({
      url: `/rest/scrobble.view?${auth}&id=${trackId}&time=${ms}`,
    });
    expect(JSON.parse(res.body)['subsonic-response'].status).toBe('ok');

    const rows = playHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].played_at).toBe(Math.floor(ms / 1000));
  });

  it('does NOT log on submission=false (now-playing notification)', async () => {
    const res = await app.inject({
      url: `/rest/scrobble.view?${auth}&id=${trackId}&submission=false`,
    });
    expect(JSON.parse(res.body)['subsonic-response'].status).toBe('ok');
    expect(playHistory()).toHaveLength(0);
  });
});

// ── stream.view play logging ──────────────────────────────────────────────────

describe('stream.view play logging', () => {
  it('logs a play when streaming starts', async () => {
    await app.inject({ url: `/rest/stream.view?${auth}&id=${trackId}` });
    const rows = playHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].track_id).toBe(trackId);
    expect(rows[0].client).toBe('test');
  });

  it('does not log when track is not found', async () => {
    await app.inject({ url: `/rest/stream.view?${auth}&id=99999` });
    expect(playHistory()).toHaveLength(0);
  });

  it('does not log when file is missing from disk', async () => {
    getDb().prepare('UPDATE tracks SET path = ? WHERE id = ?').run('/no/such/file.wav', trackId);
    await app.inject({ url: `/rest/stream.view?${auth}&id=${trackId}` });
    expect(playHistory()).toHaveLength(0);
  });

  it('logs one play per stream request', async () => {
    await app.inject({ url: `/rest/stream.view?${auth}&id=${trackId}` });
    await app.inject({ url: `/rest/stream.view?${auth}&id=${trackId}` });
    expect(playHistory()).toHaveLength(2);
  });
});
