import { readFileSync } from 'fs';

/**
 * The running server's version. Release images set RIFFPLAYER_VERSION from the
 * git tag (see the Dockerfile and release workflow), so the tag is the single
 * source of truth; in development it falls back to server/package.json.
 */
function readVersion(): string {
  const fromEnv = process.env.RIFFPLAYER_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // fall through
  }
  return 'unknown';
}

export const APP_VERSION = readVersion();
