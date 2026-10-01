# Contributing to RiffPlayer

Thanks for your interest! RiffPlayer is a small project, and bug reports, ideas and pull requests are all welcome.

## Reporting bugs and asking for features

Open an [issue](https://github.com/atabayrak460/riffplayer/issues/new/choose) and pick the matching template. For bugs, the most useful details are your RiffPlayer version, how you run it (Docker, from source), and the steps to reproduce.

**Security problems:** please do not file a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

The repository is a monorepo:

| Folder | What it is |
|---|---|
| `server/` | Node.js + TypeScript backend (Fastify, SQLite) |
| `web/` | React + TypeScript web app (installable PWA) |
| `mobile/` | Flutter Android app |

```bash
npm ci                 # installs server + web (npm workspaces)
npm run server         # backend with auto-reload
npm run web            # web app dev server (Vite), proxies to the backend on :4533
```

`ffmpeg` must be installed for the transcoding tests. For the mobile app: install Flutter, then `cd mobile && flutter pub get && flutter run`. More detail is in the [README](README.md#development) and [`mobile/README.md`](mobile/README.md).

## Before you open a pull request

CI runs the same checks, so running them locally saves a round trip:

```bash
# server and web (run each from its own folder)
npx tsc --noEmit
npm run lint
npx vitest run
# web only
npm run build

# mobile (from mobile/)
flutter analyze
flutter test
```

Guidelines:

- Keep pull requests small and focused on one change.
- Add or update tests when you change behaviour. If you fix a bug, a test that fails without your fix is ideal.
- RiffPlayer must keep working with the Subsonic API. Don't change existing Subsonic responses to add a feature; use the extended `/api/v1` API for that.
- The server only serves the user's own files. Features that fetch or download music from external services won't be accepted.
- No telemetry or "phoning home". Anything that contacts an external service must be opt-in and documented.

## License

By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE), the same as the project.
