# Roadmap — Cadence

Build **phase by phase**. Do not start a phase until the previous phase's *Done when* criteria are met. Each task is a checkbox; commit per task.

---

## Phase 0 — Project setup
**Goal:** a working monorepo skeleton.

- [x] Init monorepo: `/server`, `/web`, `/mobile`, `/docs`.
- [x] `/server`: Node + TS + Fastify, strict tsconfig, ESLint + Prettier, test runner (vitest).
- [x] SQLite wired up (`better-sqlite3`) with a migration mechanism.
- [x] `GET /rest/ping.view` returns the Subsonic OK response.
- [x] Dockerfile + `docker-compose.yml` that boots the empty server.

**Done when:** `docker compose up` serves a `ping` that a Subsonic client accepts.

---

## Phase 1 — Working minimum server (the heart)
**Goal:** index a music folder and stream it to a real Subsonic client.

- [x] **Indexer:** scan a configured folder, read tags (`music-metadata`), upsert artists/albums/tracks into SQLite. Handle re-scan without duplicates.
- [x] Implement the Subsonic auth handshake (token + salt; also OpenSubsonic API key).
- [x] Implement the minimum Subsonic endpoints listed in `ARCHITECTURE.md`.
- [x] **`stream`** with `ffmpeg` transcoding option + HTTP range support.
- [x] **`getCoverArt`** (embedded art first).
- [x] **Log every play into `play_history`** (via `scrobble` + stream). _Non-negotiable from now on._
- [x] Tests for indexer + core endpoints.

**Done when:** a real client (Amperfy on iOS / Symfonium or DSub on Android) connects, browses the library, and **streams a song**. Verify before continuing.

---

## Phase 2 — First-party web client
**Goal:** listen and manage queue from your own UI.

- [x] React + TS app, login against the server, responsive layout.
- [x] Library browse: albums / artists / songs, album & artist detail.
- [x] Player (HTML5 audio): play/pause, next/prev, seek, volume.
- [x] **Queue management:** add to queue, reorder (drag), clear.
- [x] Favorites + recently played + play counts (read from `play_history`).
- [x] Search.
- [x] PWA: manifest, installable, Media Session API for lock-screen metadata.

**Done when:** you can run your library end-to-end from the web app, including queue reordering.

---

## Phase 3 — Differentiating features
**Goal:** clearly nicer than the Navidrome experience.

- [x] Playlists: create / edit / delete / reorder.
- [x] **Custom playlist cover upload** (via `/api/v1`, stored as a file).
- [x] Cover art fetching: MusicBrainz + Cover Art Archive, with manual override; precedence per ARCHITECTURE.
- [x] **Synced lyrics** via LRCLIB (display time-synced; fall back to `.lrc` files / plain text).
- [x] **ReplayGain / volume normalization** in the player.

**Done when:** the first-party web experience feels better than Navidrome on the things users complain about.

---

## Phase 4 — Polish & release
**Goal:** something the public can install in minutes.

- [x] One-command Docker install + documented `docker-compose.yml`.
- [x] Multi-user accounts + admin panel (manage users, libraries, transcoding, settings).
- [x] Last.fm / ListenBrainz scrobbling (opt-in).
- [x] On-the-fly transcode settings per user (mobile-data friendly).
- [ ] README, screenshots, live demo, license (AGPL recommended). _README exists; still missing screenshots, a live demo link, and a LICENSE file._
- [x] Gentle in-app donation pattern (see FEATURES.md) — admin can disable server-wide.

**Done when:** published on GitHub; a stranger can self-host it from the README alone.

---

## Phase 5 — Native mobile (Flutter) — runs in parallel after Phase 2
**Goal:** the real reason this project exists — a great first-party app on iOS + Android.

- [x] Flutter app: login, library browse, player.
- [x] **Background playback** + lock-screen / notification controls + skip shortcuts.
- [x] **Offline downloads** (store originals; respect transcoding settings).
- [x] Queue + playlists + favorites parity with web.
- [ ] App Store (requires Apple Developer account, $99/yr + review) + Play Store + optional F-Droid. _Not started — needs developer accounts/signing setup; flag before proceeding per CLAUDE.md._

**Done when:** both apps stream, play in the background, and download for offline use.

---

## Phase 6 — Recommendations & AI (optional, last)
**Goal:** opt-in discovery. Default off.

- [x] Lightweight default: Last.fm / ListenBrainz "similar artists/tracks" suggestions.
- [x] Advanced mode: admin connects Ollama; local model produces weekly suggestions from `play_history`. Local, no internet required.
- [x] **Name-only output.** Never provide a source/link to obtain audio.
- [x] Year-end "Wrapped": stats from `play_history` (top songs/artists, minutes, genres); AI optionally writes the personalized summary text. _Requires a year of logged data — already collected since Phase 1._

**Done when:** a user can opt into recommendations and a yearly recap, with no data leaving their server.
