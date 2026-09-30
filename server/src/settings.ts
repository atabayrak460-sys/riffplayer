import { getDb } from './db/database.js';

/**
 * Admin-controlled feature switch stored in the `settings` table. On unless
 * explicitly set to 'false' — the same convention the web admin page uses for
 * its other default-on toggles.
 */
export function isSettingEnabled(key: string): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value !== 'false';
}

/** Setting keys for lookups that contact outside services (see README → Principles). */
export const LYRICS_LOOKUP_SETTING = 'lyrics_lookup_enabled';
export const COVER_LOOKUP_SETTING = 'cover_lookup_enabled';
