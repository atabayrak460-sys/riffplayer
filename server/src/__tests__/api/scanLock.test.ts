import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { authParams } from '../subsonic/helpers.js';

let app: FastifyInstance;
let tmpDir: string;
let libId: number;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'riffplayer-scan-lock-'));
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  libId = Number(
    getDb().prepare("INSERT INTO libraries (name, fs_path) VALUES ('Test', ?)").run(tmpDir).lastInsertRowid,
  );
});

afterEach(async () => {
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

const auth = authParams(); // admin/admin, seeded by migrations

describe('POST /api/v1/admin/libraries/:id/scan — concurrency guard', () => {
  it('rejects a second scan request for the same library while the first is still running', async () => {
    const first = await app.inject({ method: 'POST', url: `/api/v1/admin/libraries/${libId}/scan?${auth}` });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'POST', url: `/api/v1/admin/libraries/${libId}/scan?${auth}` });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: string }).error).toMatch(/already in progress/);
  });

  it('reports scanning: true in GET /admin/libraries while in flight, false once the scan settles', async () => {
    await app.inject({ method: 'POST', url: `/api/v1/admin/libraries/${libId}/scan?${auth}` });

    const during = await app.inject({ method: 'GET', url: `/api/v1/admin/libraries?${auth}` });
    const duringLibs = (during.json() as { libraries: { id: number; scanning: boolean }[] }).libraries;
    expect(duringLibs.find((l) => l.id === libId)?.scanning).toBe(true);

    // The background scan targets an empty directory, so it settles quickly.
    await new Promise((r) => setTimeout(r, 300));

    const after = await app.inject({ method: 'GET', url: `/api/v1/admin/libraries?${auth}` });
    const afterLibs = (after.json() as { libraries: { id: number; scanning: boolean }[] }).libraries;
    expect(afterLibs.find((l) => l.id === libId)?.scanning).toBe(false);
  });
});
