-- Subsonic-native getPlayQueue/savePlayQueue (#4) — cross-device playback
-- resume, the way DSub/Amperfy and other third-party clients expect. One row
-- per user; song_ids is a JSON array (queue order matters and IN doesn't
-- preserve it, so order is re-applied in application code on read).
CREATE TABLE play_queue (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  song_ids    TEXT NOT NULL,
  current_id  TEXT,
  position_ms INTEGER NOT NULL DEFAULT 0,
  changed_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  changed_by  TEXT
);
