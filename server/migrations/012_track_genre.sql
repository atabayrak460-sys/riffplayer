-- Genre was already parsed by the indexer's music-metadata read but never
-- persisted (#5). Single value (first genre tag), mirroring how artist/album
-- already take the primary tag rather than modeling a multi-genre relation.
ALTER TABLE tracks ADD COLUMN genre TEXT;

CREATE INDEX idx_tracks_genre ON tracks(genre);
