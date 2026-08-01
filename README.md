# Cadence

A self-hosted music server with a polished first-party web client, native mobile apps, and full Subsonic API compatibility. Stream your own music library from anywhere — use Cadence's built-in web app, the Flutter iOS/Android app, or any Subsonic-compatible client (Amperfy, Symfonium, DSub, Feishin, …).

## Screenshots

| | |
|---|---|
| ![Home](screenshots/home.png) | ![Albums](screenshots/albums.png) |
| ![Album detail](screenshots/album-detail.png) | ![Player with queue](screenshots/player.png) |

<details>
<summary>Login</summary>

![Login](screenshots/login.png)

</details>

## Features

### Server
- **Subsonic / OpenSubsonic API** — drop-in replacement for Navidrome, Airsonic, etc.; any Subsonic client works unchanged
- **Library indexing** — walks your music folder, reads tags via `music-metadata`, upserts artists/albums/tracks into SQLite; re-scans skip unchanged files
- **Streaming** — serves originals or transcodes on the fly with ffmpeg (MP3, AAC, Opus, OGG, FLAC); HTTP range requests for seeking
- **Per-user transcode settings** — each user can set a preferred format and bitrate cap (useful for mobile data)
- **ReplayGain** — reads RG tags during indexing; applies `-af volume=XdB` via ffmpeg when transcoding
- **Cover art pipeline** — embedded art → Cover Art Archive (via MusicBrainz release MBID) → manual upload; cached to disk
- **Synced lyrics** — `getLyricsBySongId` (OpenSubsonic): checks `.lrc` sidecar files, then LRCLIB API; caches in DB
- **Play history** — every play logged from day one (`play_history` table); feeds recently-played, most-played, recommendations, and Wrapped
- **Scrobbling** — Last.fm (with proper `api_sig` signing) and ListenBrainz, opt-in per-user; fires after confirmed plays
- **JWT authentication** — `POST /api/v1/auth/login` issues a 90-day token; `/api/v1` routes accept Bearer JWT with Subsonic token fallback

### Web client
- **React + TypeScript PWA** — installable, responsive, dark-themed
- **Library browse** — albums grid (sort by newest / recently played / most played / starred / A–Z / random), artist index, album and artist detail pages
- **Search** — finds artists, albums, and songs simultaneously
- **Queue management** — add tracks, drag-to-reorder (@dnd-kit), remove, clear; persistent across navigation
- **Player** — HTML5 audio, play/pause/next/prev, seek bar, volume; applies ReplayGain gain offset to `audio.volume`
- **Synced lyrics panel** — slide-in overlay with per-line time sync and auto-scroll; toggled from the player bar
- **Favourites** — star/unstar tracks, albums, and artists; dedicated Favourites page
- **Playlists** — create, rename, delete, drag-to-reorder tracks, upload custom cover image
- **Recently played + most played** — backed by `play_history` via `getAlbumList2?type=recent/frequent`
- **Admin panel** — manage users (create, change password/role, delete), music libraries (add path, trigger scan, remove), and server settings
- **User settings** — per-user transcoding preferences, ListenBrainz token, Last.fm session key
- **Discover / recommendations** — opt-in; similar-artist picks from Last.fm or fully local AI via Ollama; only suggests tracks already in your library, never external links
- **Year-end Wrapped** — top tracks, artists, albums, total hours, plays-by-month chart; optional Ollama AI narrative summary
- **Media Session API** — lock-screen metadata and transport controls in supported browsers
- **Workbox service worker** — cover art cached for offline browsing

### Mobile (Flutter — iOS + Android)
- **Background playback** with lock-screen controls and skip shortcuts (`audio_service` + `just_audio`)
- **Offline downloads** — stores originals on device (Dio + SQLite); played from local file when available
- **Full parity** with web: browse, search, queue, playlists, favourites
- **Full-screen player** with seek slider, star/unstar, prev/play/next
- **Per-tab navigation** with persistent mini-player across all screens

### Infrastructure
- **Multi-user** — each user has their own play history, favourites, playlists, and scrobbling config; admin manages everything
- **Docker** — three-stage build (web → server → runtime); `CADENCE_ADMIN_PASSWORD` configurable before first boot; serves web app statically from the same port
- **SQLite** — single-file database, zero external dependencies; WAL mode; full migration history

## Quick start

### Docker (recommended)

```bash
# 1. Clone the repo
git clone https://github.com/your-username/cadence.git
cd cadence

# 2. Point it at your music — edit docker-compose.yml:
#    volumes:
#      - /path/to/your/music:/music:ro

# 3. Start
docker compose up -d

# 4. Open http://localhost:4533 — sign in with admin / admin
#    IMPORTANT: change the password immediately via Admin → Users.
```

Set a secure admin password before first boot:

```yaml
# docker-compose.yml
environment:
  CADENCE_ADMIN_USER: admin
  CADENCE_ADMIN_PASSWORD: changeme   # ← set this
```

### Index your library

1. Sign in as admin.
2. Go to **Admin → Libraries**, add the path to your music (e.g. `/music`).
3. Click **⟳ Scan** — Cadence walks the directory, reads tags, and populates the database.
4. Refresh the Albums page.

Re-scanning is safe and fast: unchanged files (same mtime) are skipped.

## Configuration

All runtime configuration is via environment variables. Everything else is in the admin panel.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4533` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address |
| `DB_PATH` | `./cadence.db` | SQLite database path |
| `COVERS_DIR` | `./covers` | Cover art cache directory |
| `CADENCE_ADMIN_USER` | `admin` | Username for the auto-created admin account |
| `CADENCE_ADMIN_PASSWORD` | `admin` | Password for the auto-created admin account |
| `NODE_ENV` | `development` | Set to `production` in Docker |

## Development

### Prerequisites

- Node.js 22+
- ffmpeg (for transcoding; optional for basic browsing)
- Flutter SDK ≥ 3.22 (for mobile only)

```bash
# Install all workspace dependencies
npm install

# Start the API server (port 4533, hot-reload)
npm run server

# Start the web dev server (port 5173, proxies /rest and /api to 4533)
npm run web

# Run server tests (101 tests across 12 suites)
npm test --workspace=server

# Type-check server
npm run -w server build

# Type-check web
cd web && npx tsc --noEmit
```

### Project layout

```
/server            Node.js + TypeScript API
  src/
    auth/          JWT, Subsonic token auth, credential crypto
    db/            SQLite init + migration runner
    indexer/       Library scanner (music-metadata)
    recommendations/  Last.fm + Ollama + Wrapped stats
    routes/
      subsonic/    Subsonic / OpenSubsonic endpoints
      api/         Custom REST API (/api/v1)
  migrations/      SQL migration files (run on startup)

/web               React + TypeScript PWA
  src/
    api/           Subsonic JSON client + types
    components/    Shared UI (CoverArt, PlayerBar, LyricsPanel, …)
    pages/         Route-level views
    store/         Zustand stores (auth, player)

/mobile            Flutter app (iOS + Android)
  lib/
    api/           Subsonic Dart client
    audio/         audio_service AudioHandler
    providers/     Riverpod state
    screens/       All screens
    services/      Auth storage, offline downloads (sqflite)
    widgets/       Shared widgets

/docs              Architecture + feature specs
Dockerfile         3-stage build: web → server → runtime image
docker-compose.yml Example deployment
```

## Subsonic client setup

Point any Subsonic client at `http://your-server:4533` and sign in with your Cadence credentials. Cadence implements the OpenSubsonic extensions (`songLyrics` via `getLyricsBySongId`, `replayGain` fields on songs).

**Tested clients:** Amperfy (iOS), Symfonium (Android), DSub (Android), Feishin (desktop).

## Scrobbling

### Last.fm

1. **Admin → Settings**: enter your **API key** and **shared secret** from [last.fm/api](https://www.last.fm/api/account/create) and enable Last.fm.
2. **Each user → Settings → Last.fm**: paste your **session key** (obtain via the Last.fm auth flow or any `lastfm-session-key` helper tool).

### ListenBrainz

**Settings → ListenBrainz**: paste your token from [listenbrainz.org/profile](https://listenbrainz.org/profile/).

## Recommendations

Recommendations are opt-in and default off. Enable in **Admin → Settings → Recommendations**.

| Mode | Setup | Data leaves server? |
|---|---|---|
| **Last.fm** (default) | Last.fm API key in Admin → Settings | Artist names sent to Last.fm |
| **Ollama** (advanced) | `ollama_url` + `ollama_model` in Admin → Settings | Nothing — fully local |

All suggestions are tracks already in your library. Cadence never shows external links or sources to acquire music.

### Ollama setup

```bash
# Install Ollama — https://ollama.com
ollama pull llama3.2

# Default URL: http://localhost:11434
# Set in Admin → Settings → Ollama URL
```

## Year-end Wrapped

**Wrapped** (`/wrapped` in the web app) shows your year-in-music stats: top tracks, artists, albums, total hours, and a monthly listening chart — all derived from your local `play_history` table. If Ollama is configured, click **Generate with Ollama** for a personalised narrative summary.

## Mobile app

See [`mobile/README.md`](mobile/README.md) for setup instructions. Flutter SDK ≥ 3.22 required; run `flutter create . --org com.cadence` in the `mobile/` directory to generate the platform directories before building.

## License

[AGPL-3.0](LICENSE)

Cadence is free software. You may run it privately, share it with family, or fork and redistribute it — as long as the source of any derivative stays open under the same licence.
