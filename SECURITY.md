# Security Policy

RiffPlayer is a server you run on your own machine, often exposed to a network, so security reports are taken seriously.

## Supported versions

Only the [latest release](https://github.com/atabayrak460/riffplayer/releases/latest) receives security fixes. Please update before reporting, in case the problem is already fixed.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting instead:

1. Go to the [Security tab](https://github.com/atabayrak460/riffplayer/security) of this repository.
2. Click **Report a vulnerability**.
3. Describe what you found, how to reproduce it, and what version you tested.

This is a small, volunteer-run project. I aim to acknowledge a report within about a week and to fix confirmed issues as quickly as I reasonably can. I will credit you in the release notes if you would like that.

## What is in scope

- The server (`/server`): authentication, the Subsonic and `/api/v1` endpoints, file access, transcoding.
- The web app (`/web`) and the Android app (`/mobile`).
- The published Docker image and release workflow.

## Good to know

- On first start the server creates an `admin` account with a **random password** that is printed once in the log (`docker compose logs riffplayer`). Set `RIFFPLAYER_ADMIN_PASSWORD` if you prefer your own.
- If you expose RiffPlayer to the internet, put it behind HTTPS (for example a reverse proxy). The server does not terminate TLS itself.
- RiffPlayer keeps its database and cover cache in `/data`, not in your music folder, so you can mount the library read-only (`:ro`), as the example `docker-compose.yml` does.
