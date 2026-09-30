# CLAUDE.md — Project Context for Claude Code

**Name:** RiffPlayer

**What it is:** An open-source, self-hosted music server with first-party **web** and **native mobile** clients. A Navidrome alternative that competes on UX and on a polished, cohesive first-party app experience — especially on **iOS**, which the self-hosted ecosystem underserves.

You (Claude Code) are building this from scratch. **Read every file in `docs/` before writing code.** Build strictly phase by phase per `docs/ROADMAP.md`. Do not jump ahead.

---

## Core principles (do NOT violate)

1. **Subsonic / OpenSubsonic compatibility is a hard baseline.** The server must speak the Subsonic API so existing clients (Symfonium, Amperfy, Feishin, etc.) work against it unchanged. Build the project's own extended REST API _on top_ for features Subsonic doesn't cover (e.g. custom playlist cover upload, advanced queue). **Never break Subsonic compatibility to add a feature** — add it on the custom API instead.

2. **The app only serves the user's own files.** Never implement downloading or sourcing music from YouTube, SoundCloud, Spotify or any external source. No `yt-dlp`, no scrapers. The recommendation engine (late phase) only suggests *names* — it never provides a source, link, or means to obtain audio. This keeps the project legally clean (the Plex / Jellyfin model).

3. **Log listening events from day one.** Every play is recorded (track, user, timestamp, client) starting in Phase 1 — even though stats / "Wrapped" UI come much later. History cannot be reconstructed retroactively, so the data must exist from the start.

4. **Privacy first.** No telemetry, no phoning home. Any AI / recommendation feature runs locally (e.g. Ollama) or via an opt-in API the admin explicitly configures.

5. **Unobtrusive donations.** No nag screens. See `docs/FEATURES.md` for the exact pattern.

---

## Tech stack (authoritative)

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript, **Fastify** |
| Database | SQLite (use `better-sqlite3`; document the choice in ARCHITECTURE.md) |
| Tag reading | `music-metadata` |
| Transcoding | `ffmpeg` (invoked as subprocess) |
| Web client | React + TypeScript, responsive, installable as a **PWA** |
| Mobile | **Flutter** (Dart) — iOS + Android, single codebase |
| Distribution | **Docker** primary; mobile via App Store / Play Store / F-Droid |

TypeScript **strict mode**. ESLint + Prettier. Prefer well-maintained libraries; document every non-trivial dependency choice in `docs/ARCHITECTURE.md`.

---

## Repo layout (monorepo)

```
/server            Node + TS backend (Subsonic API + custom API)
/web               React + TS web client (PWA)
/mobile            Flutter app (iOS + Android)
/docs              specs (read these first)
docker-compose.yml example deployment
CLAUDE.md          this file
README.md          public-facing project readme (write in Phase 4)
```

---

## How to work

- Start at `docs/ROADMAP.md` **Phase 0**, then Phase 1. Finish a phase's *done-criteria* before moving on.
- **Phase 1 milestone gate:** before building the web client, verify a real Subsonic client (Amperfy on iOS, or Symfonium/DSub on Android) can connect to the server and stream a song. If it can't, the API isn't done.
- Keep commits small and scoped to one task. Write tests for the indexer and the API endpoints.
- When something is ambiguous or risky, **stop and ask the human**, specifically for: secrets / API keys, anything touching legality, App Store / signing setup, and database schema changes after Phase 1.

## Pointers

- Vision & positioning → `docs/PROJECT_BRIEF.md`
- System design & data model → `docs/ARCHITECTURE.md`
- Build phases & task checklists → `docs/ROADMAP.md`
- Feature specs & priority tiers → `docs/FEATURES.md`
