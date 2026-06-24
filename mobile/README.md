# Cadence — Flutter mobile app

Native iOS + Android client for the Cadence music server.

## Features

- Browse albums, artists, songs; search; favourites; playlists
- Stream from server or play offline (downloaded) tracks
- Full-screen player with seek, volume, and star/unstar
- **Background playback** with lock-screen controls and skip shortcuts
- **Offline downloads** stored on device; checked before streaming
- Bottom mini-player visible across all tabs

## Prerequisites

- Flutter SDK ≥ 3.22 — https://flutter.dev/docs/get-started/install
- Cadence server running (Phase 1+)

## Setup

```bash
# 1. From the repo root, generate the platform directories
cd mobile
flutter create . --org com.cadence --project-name cadence_mobile

# 2. Install packages
flutter pub get

# 3. Merge the background-audio platform config:
#    Android: copy <uses-permission> and <service>/<receiver> blocks from
#             android/app/src/main/AndroidManifest.xml into the generated file.
#    iOS:     add UIBackgroundModes (audio, fetch) and NSAppTransportSecurity
#             to ios/Runner/Info.plist.

# 4. Run on a connected device or emulator
flutter run
```

## Platform notes

### iOS

- Background audio requires the **UIBackgroundModes: audio** key in Info.plist (included).
- `NSAllowsArbitraryLoads: true` is set so you can connect to local HTTP servers; remove it
  if your server has a valid TLS certificate.
- App Store distribution requires an Apple Developer account ($99/yr).

### Android

- The foreground service type `mediaPlayback` is declared in AndroidManifest.xml; this is
  mandatory on Android 10+ for uninterrupted background playback.
- For API 33+ notification permission is requested at runtime (handled by audio_service).

## Building for release

```bash
# Android APK
flutter build apk --release

# Android App Bundle (Play Store)
flutter build appbundle --release

# iOS (requires Xcode + provisioning profile)
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
