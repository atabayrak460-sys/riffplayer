-- Core users and settings

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Music library

CREATE TABLE libraries (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  fs_path TEXT NOT NULL
);

CREATE TABLE artists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort_name  TEXT,
  mbid       TEXT,
  image_path TEXT
);

CREATE TABLE albums (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  artist_id  INTEGER NOT NULL REFERENCES artists(id),
  year       INTEGER,
  mbid       TEXT,
  cover_path TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE lyrics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id   INTEGER NOT NULL,
  synced_lrc TEXT,
  plain_text TEXT
);

CREATE TABLE tracks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,
  album_id         INTEGER NOT NULL REFERENCES albums(id),
  artist_id        INTEGER NOT NULL REFERENCES artists(id),
  disc_no          INTEGER,
  track_no         INTEGER,
  duration_s       REAL,
  path             TEXT    NOT NULL UNIQUE,
  size             INTEGER,
  bitrate          INTEGER,
  format           TEXT,
  sample_rate      INTEGER,
  replaygain_track REAL,
  replaygain_album REAL,
  mbid             TEXT,
  lyrics_id        INTEGER REFERENCES lyrics(id),
  added_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Playlists

CREATE TABLE playlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  name       TEXT    NOT NULL,
  cover_path TEXT,
  is_public  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id)    ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);

-- User activity

CREATE TABLE favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  item_type  TEXT    NOT NULL CHECK (item_type IN ('track', 'album', 'artist')),
  item_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, item_type, item_id)
);

-- Every play is recorded here from Phase 1 onward.
-- Feeds play counts, recently-played, recommendations, and Wrapped.
CREATE TABLE play_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  track_id  INTEGER NOT NULL REFERENCES tracks(id),
  played_at INTEGER NOT NULL DEFAULT (unixepoch()),
  client    TEXT
);

-- Indexes for hot query paths

CREATE INDEX idx_tracks_album    ON tracks(album_id);
CREATE INDEX idx_tracks_artist   ON tracks(artist_id);
CREATE INDEX idx_albums_artist   ON albums(artist_id);
CREATE INDEX idx_play_history_user  ON play_history(user_id, played_at DESC);
CREATE INDEX idx_play_history_track ON play_history(track_id);
CREATE INDEX idx_favorites_user  ON favorites(user_id);
