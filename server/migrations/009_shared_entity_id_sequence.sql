-- Artists, albums, and tracks each had independent AUTOINCREMENT sequences,
-- all starting at 1 — so an album could end up with the same numeric id as
-- an unrelated artist. That's ambiguous anywhere a single numeric id has to
-- resolve to one specific entity: getMusicDirectory.view queries artists
-- first and only falls back to albums, so a colliding album becomes
-- permanently unreachable through it.
--
-- New artists/albums/tracks now draw their id from one shared counter
-- instead, so newly-indexed rows can never collide with each other again.
-- Existing rows keep whatever id they already have — this does not
-- renumber (or fix collisions in) a library that's already been scanned.
CREATE TABLE id_sequence (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  next_id INTEGER NOT NULL
);

INSERT INTO id_sequence (id, next_id)
VALUES (1, (
  SELECT MAX(m) + 1 FROM (
    SELECT COALESCE(MAX(id), 0) AS m FROM artists
    UNION ALL SELECT COALESCE(MAX(id), 0) FROM albums
    UNION ALL SELECT COALESCE(MAX(id), 0) FROM tracks
  )
));
