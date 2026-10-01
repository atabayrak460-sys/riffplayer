# RiffPlayer — Flutter mobile app

Flutter client for the RiffPlayer music server. **Android is supported and released** (signed APKs on GitHub Releases). The iOS project files are in the repo, but iOS builds are not verified on hardware or published yet.

## Features

- Browse albums, artists, songs; search; favourites; playlists
- Stream from server or play offline (downloaded) tracks
- Full-screen player with seek, volume, and star/unstar
- **Background playback** with lock-screen controls and skip shortcuts
- **Offline downloads** stored on device; checked before streaming
- Bottom mini-player visible across all tabs

## Prerequisites

- Flutter SDK ≥ 3.22 — https://flutter.dev/docs/get-started/install
- RiffPlayer server running (Phase 1+)

## Setup

The Android and iOS project files are already in the repo.

```bash
cd mobile
flutter pub get

# Run on a connected device or emulator
flutter run

# Tests and static analysis
flutter analyze
flutter test
```

In the app, enter your server address (for example `http://192.168.1.10:4533`) and sign in.

## Platform notes

### iOS (planned — not verified or published yet)

- Background audio requires the **UIBackgroundModes: audio** key in Info.plist (included).
- `NSAllowsArbitraryLoads: true` is set so you can connect to local HTTP servers; remove it
  if your server has a valid TLS certificate.
- App Store distribution requires an Apple Developer account ($99/yr).

### Android

- The foreground service type `mediaPlayback` is declared in AndroidManifest.xml; this is
  mandatory on Android 10+ for uninterrupted background playback.
- For API 33+ notification permission is requested at runtime (handled by audio_service).

## Building for release

Tagged releases (`v*`) are built and signed automatically by
[`.github/workflows/release.yml`](../.github/workflows/release.yml) and attached to the
GitHub Release. To build locally:

```bash
# Debug-signed unless android/key.properties exists — never publish such a build
flutter build apk --release --split-per-abi

# Signed: create mobile/android/key.properties (gitignored) with
#   storeFile=/path/to/release.jks
#   storePassword=…   keyAlias=…   keyPassword=…
# then run the same command.

# iOS (requires Xcode + an Apple Developer account for a provisioning profile)
flutter build ios --release
```

## Architecture

```
lib/
  main.dart          — init AudioService, run app
  app.dart           — GoRouter + MaterialApp.router
  theme.dart         — dark purple theme
  api/
    types.dart       — Album, Artist, Song, Playlist data classes
    subsonic.dart    — SubsonicClient (MD5 token auth, all endpoints)
  services/
    auth_service.dart    — SharedPreferences credential storage
    download_service.dart — SQLite download tracking + Dio file download
  audio/
    audio_handler.dart   — BaseAudioHandler (just_audio + audio_service)
  providers/
    providers.dart       — all Riverpod providers
  screens/ + widgets/    — UI
```
