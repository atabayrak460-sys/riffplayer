import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { closeDb, getDb } from '../../db/database.js';
import { getOrCreateServerSecret } from '../../auth/seed.js';
import { hashPassword, encryptPassword } from '../../auth/crypto.js';
import { authParams } from './helpers.js';

let app: FastifyInstance;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cadence-subsonic-scan-'));
  app = await buildApp({ dbPath: ':memory:' });
  await app.ready();
  getDb().prepare("INSERT INTO libraries (name, fs_path) VALUES ('Test', ?)").run(tmpDir);
});

afterEach(async () => {
  await app.close();
  closeDb();
  await rm(tmpDir, { recursive: true });
});

function sr(body: string) {
  return (JSON.parse(body) as Record<string, Record<string, unknown>>)['subsonic-response'];
}

const auth = authParams(); // admin/admin

describe('getScanStatus', () => {
  it('reports not scanning with a zero count when nothing has run yet', async () => {
    const res = await app.inject({ url: `/rest/getScanStatus.view?${auth}` });
    const r = sr(res.body);
    expect(r.status).toBe('ok');
    const status = r.scanStatus as { scanning: boolean; count: number };
    expect(status.scanning).toBe(false);
    expect(status.count).toBe(0);
  });
});

describe('startScan', () => {
  it('rejects a non-admin user', async () => {
    const db = getDb();
    const secret = getOrCreateServerSecret(db);
    db.prepare(
      "INSERT INTO users (username, password_hash, subsonic_token, role) VALUES ('regular', ?, ?, 'user')",
    ).run(hashPassword('pw'), encryptPassword('pw', secret));

    const res = await app.inject({ url: `/rest/startScan.view?${authParams('pw').replace('u=admin', 'u=regular')}` });
    const r = sr(res.body);
    expect(r.status).toBe('failed');
    expect((r.error as { code: number }).code).toBe(50); // NOT_AUTHORIZED
  });

  it('triggers a scan and getScanStatus reflects it finishing with a real count', async () => {
    await writeFile(path.join(tmpDir, 'song.mp3'), Buffer.alloc(16));

    const startRes = await app.inject({ method: 'POST', url: `/rest/startScan.view?${auth}` });
    expect(sr(startRes.body).status).toBe('ok');

    // The scan runs in the background (fire-and-forget, same as the custom
    // admin endpoint) — poll getScanStatus until it reports done rather than
    // asserting on a specific in-flight state, which would be a race.
    let status: { scanning: boolean; count: number } | undefined;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ url: `/rest/getScanStatus.view?${auth}` });
      status = sr(res.body).scanStatus as { scanning: boolean; count: number };
      if (!status.scanning) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(status?.scanning).toBe(false);
    expect(status?.count).toBe(1);
  });
});
