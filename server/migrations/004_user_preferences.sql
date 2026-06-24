-- Per-user transcoding preferences and third-party scrobbling credentials
CREATE TABLE user_preferences (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  transcode_format   TEXT,     -- null = serve original; e.g. 'mp3', 'aac', 'opus'
  transcode_bitrate  INTEGER,  -- kbps; null = no limit
  lastfm_session_key TEXT,     -- Last.fm session key (from auth.getSession)
  listenbrainz_token TEXT      -- ListenBrainz user token
);

-- Ensure every user gets a preferences row on demand (done lazily in code).
