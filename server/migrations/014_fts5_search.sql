-- #52: search3 (and local artist-name matching) used LIKE '%...%', a full
-- table scan with no index. FTS5 virtual tables (external-content — no data
-- duplicated, tracks/albums/artists stay the source of truth) let search
-- use a real index instead. The trigram tokenizer keeps substring-anywhere
-- matching behavior identical to the old LIKE '%...%' (not just
-- prefix/whole-token matching, which plain FTS5 tokenizers give you),
-- case-insensitive to match SQLite's default LIKE behavior.
--
-- Triggers on the content tables keep each FTS index in sync automatically
-- on insert/update/delete — no application code needs to know these tables
-- exist.

CREATE VIRTUAL TABLE artists_fts USING fts5(name, content='artists', content_rowid='id', tokenize='trigram case_sensitive 0');
CREATE VIRTUAL TABLE albums_fts  USING fts5(name, content='albums',  content_rowid='id', tokenize='trigram case_sensitive 0');
CREATE VIRTUAL TABLE tracks_fts  USING fts5(title, content='tracks', content_rowid='id', tokenize='trigram case_sensitive 0');

INSERT INTO artists_fts(rowid, name)  SELECT id, name  FROM artists;
INSERT INTO albums_fts(rowid, name)   SELECT id, name  FROM albums;
INSERT INTO tracks_fts(rowid, title)  SELECT id, title FROM tracks;

CREATE TRIGGER artists_fts_ai AFTER INSERT ON artists BEGIN
  INSERT INTO artists_fts(rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER artists_fts_ad AFTER DELETE ON artists BEGIN
  INSERT INTO artists_fts(artists_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
CREATE TRIGGER artists_fts_au AFTER UPDATE ON artists BEGIN
  INSERT INTO artists_fts(artists_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO artists_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER albums_fts_ai AFTER INSERT ON albums BEGIN
  INSERT INTO albums_fts(rowid, name) VALUES (new.id, new.name);
END;
CREATE TRIGGER albums_fts_ad AFTER DELETE ON albums BEGIN
  INSERT INTO albums_fts(albums_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;
CREATE TRIGGER albums_fts_au AFTER UPDATE ON albums BEGIN
  INSERT INTO albums_fts(albums_fts, rowid, name) VALUES ('delete', old.id, old.name);
  INSERT INTO albums_fts(rowid, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER tracks_fts_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title) VALUES (new.id, new.title);
END;
CREATE TRIGGER tracks_fts_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title) VALUES ('delete', old.id, old.title);
END;
CREATE TRIGGER tracks_fts_au AFTER UPDATE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title) VALUES ('delete', old.id, old.title);
  INSERT INTO tracks_fts(rowid, title) VALUES (new.id, new.title);
END;
