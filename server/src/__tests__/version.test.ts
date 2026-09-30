import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';

const pkgVersion = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { version: string }
).version;

async function freshVersion(): Promise<string> {
  vi.resetModules(); // APP_VERSION is computed once at import time
  return (await import('../version.js')).APP_VERSION;
}

const saved = process.env.RIFFPLAYER_VERSION;
afterEach(() => {
  if (saved === undefined) delete process.env.RIFFPLAYER_VERSION;
  else process.env.RIFFPLAYER_VERSION = saved;
});

describe('APP_VERSION', () => {
  it('uses RIFFPLAYER_VERSION when set (release images: the git tag)', async () => {
    process.env.RIFFPLAYER_VERSION = '9.8.7';
    expect(await freshVersion()).toBe('9.8.7');
  });

  it('falls back to server/package.json when unset', async () => {
    delete process.env.RIFFPLAYER_VERSION;
    expect(await freshVersion()).toBe(pkgVersion);
  });

  it('treats an empty value (an unset Docker build arg) as unset', async () => {
    process.env.RIFFPLAYER_VERSION = '  ';
    expect(await freshVersion()).toBe(pkgVersion);
  });
});

describe('ping reports the real version', () => {
  it('serverVersion follows RIFFPLAYER_VERSION rather than a hard-coded string', async () => {
    vi.resetModules(); // response.ts captures APP_VERSION at import time
    process.env.RIFFPLAYER_VERSION = '7.7.7';
    const { buildApp } = await import('../app.js');
    const { closeDb } = await import('../db/database.js');
    const app = await buildApp({ dbPath: ':memory:' });
    await app.ready();
    const res = await app.inject({ url: '/rest/ping.view?f=json' });
    await app.close();
    closeDb();

    const sr = JSON.parse(res.body)['subsonic-response'] as { serverVersion: string };
    expect(sr.serverVersion).toBe('7.7.7');
  });
});
