-- Per-user sidebar state for the unified Library list (Phase 4): tracks pin
-- state and last-opened time for each entry so both survive reloads and stay
-- consistent across devices. One row per (user, item) — system views
-- ('favorites', 'recent', 'most-played', 'downloaded', 'discover', 'wrapped')
-- and playlists (item_key = playlist id as text) share this table so the
-- sidebar can treat them uniformly.
CREATE TABLE library_sidebar_state (
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type          TEXT NOT NULL CHECK (item_type IN ('system', 'playlist')),
  item_key           TEXT NOT NULL,
  pinned_at          INTEGER,
  last_interacted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, item_type, item_key)
);
