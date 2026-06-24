import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'audio/audio_handler.dart';
import 'app.dart';
import 'providers/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialise the audio handler — this registers the background service
  // on Android and enables background audio on iOS.
  final audioHandler = await AudioService.init(
    builder: CadenceAudioHandler.new,
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.cadence.audio',
      androidNotificationChannelName: 'Cadence',
      androidNotificationIcon: 'mipmap/ic_launcher',
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
      child: const CadenceApp(),
    ),
  );
}
