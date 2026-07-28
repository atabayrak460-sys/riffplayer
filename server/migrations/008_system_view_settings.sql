-- Per-user custom cover + description overrides for the six system library
-- views (Favourites, Recently Played, Most Played, Downloaded, Discover,
-- Wrapped). Reuses the view_key values already established for these views
-- in library_sidebar_state (migration 007). NULL cover_path/description
-- means "use the stock SVG / the auto-generated default" — rows only exist
-- once a user actually customizes something.
CREATE TABLE system_view_settings (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_key    TEXT NOT NULL CHECK (view_key IN ('favorites', 'recent', 'most-played', 'downloaded', 'discover', 'wrapped')),
  cover_path  TEXT,
  description TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, view_key)
);
