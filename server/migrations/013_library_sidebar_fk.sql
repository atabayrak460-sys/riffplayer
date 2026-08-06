-- #17: item_key was an untyped TEXT column holding either a playlist id or a
-- system-view slug, with no FK — deletePlaylist had to manually sweep this
-- table on every delete since SQLite couldn't cascade it. Split into two
-- typed, mutually exclusive columns; playlist_id gets a real FK with
-- ON DELETE CASCADE, so the manual sweep is no longer needed anywhere.

CREATE TABLE library_sidebar_state_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type          TEXT NOT NULL CHECK (item_type IN ('system', 'playlist')),
  playlist_id        INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  system_view_slug   TEXT,
  pinned_at          INTEGER,
  last_interacted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    (item_type = 'playlist' AND playlist_id IS NOT NULL AND system_view_slug IS NULL) OR
    (item_type = 'system' AND system_view_slug IS NOT NULL AND playlist_id IS NULL)
  )
);

-- Drop any row whose playlist no longer exists (an orphan the old
-- non-cascading table could accumulate) rather than violate the new FK.
INSERT INTO library_sidebar_state_new (user_id, item_type, playlist_id, system_view_slug, pinned_at, last_interacted_at)
SELECT
  user_id,
  item_type,
  CASE WHEN item_type = 'playlist' THEN CAST(item_key AS INTEGER) ELSE NULL END,
  CASE WHEN item_type = 'system' THEN item_key ELSE NULL END,
  pinned_at,
  last_interacted_at
FROM library_sidebar_state
WHERE item_type = 'system' OR CAST(item_key AS INTEGER) IN (SELECT id FROM playlists);

DROP TABLE library_sidebar_state;
ALTER TABLE library_sidebar_state_new RENAME TO library_sidebar_state;

-- One pin/interact-state row per user per playlist, and per user per system
-- view — partial indexes since exactly one of playlist_id/system_view_slug
-- is set depending on item_type.
CREATE UNIQUE INDEX idx_library_sidebar_state_playlist ON library_sidebar_state(user_id, playlist_id) WHERE item_type = 'playlist';
CREATE UNIQUE INDEX idx_library_sidebar_state_system ON library_sidebar_state(user_id, system_view_slug) WHERE item_type = 'system';
