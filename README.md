# Cadence

A self-hosted music server with a polished first-party web client and full Subsonic API compatibility. Stream your own music library from anywhere — use Cadence's built-in web app or any Subsonic-compatible client (Amperfy, Symfonium, DSub, Feishin, …).

## Features

- **Subsonic / OpenSubsonic API** — drop-in replacement; any Subsonic client works unchanged
- **Web client** — responsive React PWA with album/artist/song browsing, search, and a full queue manager
- **Queue management** — add tracks, drag to reorder, clear; a headline improvement over most alternatives
- **Streaming** — serves originals or transcodes on the fly with ffmpeg; per-user format/bitrate preference
- **Synced lyrics** — fetches time-synced lyrics from LRCLIB, falling back to `.lrc` sidecar files
- **ReplayGain** — reads RG tags and applies volume normalisation during transcoding
- **Cover art** — embedded art → Cover Art Archive (via MusicBrainz IDs) → manual upload
- **Play history** — every play logged from day one; feeds recently-played, most-played, and future recommendations
- **Playlists** — create, edit, reorder tracks, upload custom covers
- **Favourites** — star tracks, albums, and artists
- **Last.fm + ListenBrainz scrobbling** — opt-in per-user
- **Multi-user** — each user has their own library view, favourites, and play history; admin panel to manage users and libraries
- **PWA** — installable, works offline for browsing (streaming requires network)

## Quick start

### Docker (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/your-username/cadence.git
cd cadence

# 2. Point it at your music (edit docker-compose.yml if needed):
#    volumes:
#      - /path/to/your/music:/music:ro

# 3. Start
docker compose up -d

# 4. Open http://localhost:4533 and sign in with admin / admin
#    IMPORTANT: Change the password immediately via Admin → Users.
```

The admin password can be set before first boot:

```yaml
# docker-compose.yml
environment:
  CADENCE_ADMIN_USER: admin
  CADENCE_ADMIN_PASSWORD: changeme   # ← set this
```

### Index your library

1. Sign in as admin.
2. Go to **Admin → Libraries** and add the path to your music (e.g. `/music`).
3. Click **Scan** — Cadence walks the directory, reads tags, and populates the database.
4. Refresh the Albums page; your library should appear.

Re-scanning is safe and fast: unchanged files are skipped.

## Configuration

All configuration is via environment variables or the admin panel.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4533` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address |
| `DB_PATH` | `./cadence.db` | SQLite database path |
| `COVERS_DIR` | `./covers` | Cover art cache directory |
| `CADENCE_ADMIN_USER` | `admin` | Initial admin username |
| `CADENCE_ADMIN_PASSWORD` | `admin` | Initial admin password |
| `NODE_ENV` | `development` | Set to `production` in Docker |

## Development

### Prerequisites

- Node.js 22+
- ffmpeg (for transcoding)

```bash
# Install dependencies
npm install

# Start the API server (port 4533 by default)
npm run server

# In a separate terminal, start the web dev server (port 5173, proxies /rest and /api to 4533)
npm run web

# Run server tests
npm test --workspace=server
```

### Project layout

```
/server        Node.js + TypeScript API (Subsonic + custom REST)
/web           React + TypeScript PWA
/mobile        Flutter app (iOS + Android) — Phase 5
/docs          Architecture and feature specs
Dockerfile     Multi-stage Docker build (server + web)
```

## Subsonic client setup

Point any Subsonic client at `http://your-server:4533` and sign in with your Cadence credentials. The server speaks the OpenSubsonic extension protocol in addition to the base Subsonic API.

**Tested clients:** Amperfy (iOS), Symfonium (Android), DSub (Android), Feishin (desktop).

## Scrobbling

### Last.fm

1. Admin → Settings: enter your **API key** and **shared secret** from [last.fm/api](https://www.last.fm/api/account/create) and enable Last.fm.
2. Each user: Settings → Last.fm: paste your **session key** (obtain with any Last.fm auth tool or the official Last.fm API).

### ListenBrainz

Settings → ListenBrainz: paste your token from [listenbrainz.org/profile](https://listenbrainz.org/profile/).

## License

[AGPL-3.0](LICENSE)

Cadence is free software. You may run it privately, share it with family, or fork and redistribute it — as long as the source of any derivative stays open under the same licence.
