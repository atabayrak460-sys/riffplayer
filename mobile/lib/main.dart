import 'dart:async';
import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'audio/audio_handler.dart';
import 'app.dart';
import 'providers/providers.dart';
import 'theme.dart';

void main() {
  // Catches anything FlutterError.onError doesn't (async errors outside a
  // widget build, e.g. an unawaited Future rejecting) so the app logs and
  // keeps running instead of silently no-op'ing or handing the platform a
  // raw crash. No external crash reporting per CLAUDE.md's privacy-first
  // stance — this only ever logs locally.
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // Without this, the Android system navigation bar (and status bar) are
    // left at the platform/OEM default — on this device (MIUI) that's a
    // light bar with dark icons, clashing hard against the app's
    // permanently-dark theme and reading as "not a real app" rather than a
    // rendering bug. The app has no light-mode variant, so this fixed style
    // is always correct, not just a startup default.
    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: appBackgroundColor,
      systemNavigationBarIconBrightness: Brightness.light,
      systemNavigationBarDividerColor: Colors.transparent,
    ));

    FlutterError.onError = (FlutterErrorDetails details) {
      FlutterError.presentError(details);
      debugPrint('[FlutterError] ${details.exceptionAsString()}');
    };

    // Initialise the audio handler — this registers the background service
    // on Android and enables background audio on iOS.
    final audioHandler = await AudioService.init(
      builder: RiffPlayerAudioHandler.new,
      config: const AudioServiceConfig(
        androidNotificationChannelId: 'com.riffplayer.audio',
        androidNotificationChannelName: 'RiffPlayer',
        androidNotificationIcon: 'drawable/ic_stat_riff',
        androidNotificationOngoing: true,
        androidStopForegroundOnPause: true,
        notificationColor: Color(0xFFA78BFA),
      ),
    );

    runApp(
      ProviderScope(
        overrides: [
          audioHandlerProvider.overrideWithValue(audioHandler),
        ],
        child: const RiffPlayerApp(),
      ),
    );
  }, (error, stack) {
    debugPrint('[UncaughtError] $error\n$stack');
  });
}
