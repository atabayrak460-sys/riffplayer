-- subsonic_token: AES-256-GCM encrypted plaintext password.
-- Required because Subsonic token auth is md5(password+salt) — the server
-- must be able to recover the plaintext to verify it.
ALTER TABLE users ADD COLUMN subsonic_token TEXT;

-- OpenSubsonic API key auth (no plaintext needed — SHA-256 of the key is enough)
CREATE TABLE api_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash   TEXT    NOT NULL UNIQUE,
  name       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used  INTEGER
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
