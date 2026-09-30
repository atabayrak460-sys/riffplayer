# Project Brief — RiffPlayer

## One-liner
A self-hosted music server you fully own, with a beautiful first-party app on **web, iOS, and Android** — the polished client experience the open-source music stack has been missing.

## The problem
People with their own music libraries (FLAC collectors, fans of music not on streaming services, privacy-minded users) want to stream their own files like Spotify — but the self-hosted options each fall short somewhere:

- **Navidrome** — solid open-source server, improving fast, but has **no official mobile app**; users are pushed to third-party clients, and the experience isn't cohesive.
- **Plexamp** — beautiful and beloved, but closed-source, locked to Plex, and its best features sit behind a paid Plex Pass.
- **Finamp** (Jellyfin) — open-source and on iOS/Android, but still rough; Jellyfin's mobile music playback has been a long-standing pain point.
- **Symfonium** — excellent client, but Android-only, closed-source, and a *client only* (it needs a separate server behind it).

## The opportunity (our positioning)
Be the **open-source, self-hosted music stack with a genuinely good, cohesive first-party app on both iOS and Android.** No one fully owns that slot.

**Durable differentiators** (things a competitor can't copy in a single release):
1. First-party native app — designed together with the server — on **iOS and Android**.
2. Cohesive, opinionated UX across web + mobile (the Plexamp lesson: win on feel, not feature count).
3. Open-source and privacy-respecting (no telemetry; local/opt-in AI).
4. Subsonic-compatible, so users are never locked in — they can leave for another client anytime, which paradoxically makes them more willing to try us.

> Do **not** rely on small features (e.g. playlist cover upload) as the core differentiator — Navidrome can and does add those quickly. Those are table-stakes polish, not the moat.

## Target users
- Self-hosters / homelab users (the donation base; reachable via r/selfhosted, Lemmy, Hacker News).
- Music collectors and audiophiles who own large local libraries.
- iPhone users underserved by Android-only clients.

## Non-goals (explicitly out of scope)
- No sourcing/downloading music from external services (YouTube, SoundCloud, Spotify). Ever.
- No social network / friend-activity features that require a central server (breaks the self-hosted model).
- No podcasts / audiobooks in v1 (separate domain; revisit much later).
- Not trying to beat Symfonium/Plexamp feature-for-feature. Success = a real, learnable, niche-serving product people choose and donate to.

## Funding model
Donation-funded open source: GitHub Sponsors / Ko-fi / Open Collective. The two things that actually drive donations: (1) dead-simple install, (2) solving a real pain. In-app donation prompts must be gentle and never naggy — see `FEATURES.md`.

## Legal stance
The server only serves files the user already owns, exactly like Plex/Jellyfin/Navidrome. We provide a tool, not content. This keeps legal risk minimal. The recommendation engine suggests names only and never links to a source.
