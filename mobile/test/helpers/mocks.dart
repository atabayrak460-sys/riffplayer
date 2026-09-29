// Shared mocktail doubles for the app's platform-touching classes
// (audio_service/just_audio, network, sqflite) — reused across test files so
// each one only has to stub the handful of methods/streams it actually
// exercises.
import 'package:cadence_mobile/api/subsonic.dart';
import 'package:cadence_mobile/audio/audio_handler.dart';
import 'package:cadence_mobile/services/download_service.dart';
import 'package:just_audio/just_audio.dart';
import 'package:mocktail/mocktail.dart';

class MockAudioHandler extends Mock implements CadenceAudioHandler {}

class MockSubsonicClient extends Mock implements SubsonicClient {}

class MockDownloadService extends Mock implements DownloadService {}

class FakeAudioSource extends Fake implements AudioSource {}

/// Call once per test file (from `setUpAll`) before any `any()` matcher is
/// used for these types.
void registerMockFallbackValues() {
  registerFallbackValue(FakeAudioSource());
  registerFallbackValue(LoopMode.off);
}
