-- Records when a track was added to a specific playlist (distinct from
-- tracks.added_at, which is the library-add time and identical across every
-- playlist containing that track). Existing rows have no real history, so
-- backfill using position order as the best available proxy — position 0
-- assumed oldest — so a "date added" sort on old data matches the existing
-- custom order until tracks are actually added/removed again.
ALTER TABLE playlist_tracks ADD COLUMN added_at INTEGER;

UPDATE playlist_tracks
SET added_at = unixepoch() + position
WHERE added_at IS NULL;
