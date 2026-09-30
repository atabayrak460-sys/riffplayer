import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/providers/providers.dart';
import 'package:riffplayer_mobile/services/auth_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthService extends Mock implements AuthService {}

const _creds = Credentials(
  serverUrl: 'http://example.com:4533',
  username: 'alice',
  password: 'hunter2',
);

void main() {
  late MockAuthService service;

  setUp(() {
    service = MockAuthService();
  });

  group('AuthNotifier construction', () {
    test('starts in AsyncValue.loading before the stored session resolves', () {
      when(() => service.load()).thenAnswer((_) async => null);
      final notifier = AuthNotifier(service);
      expect(notifier.state, const AsyncValue<Credentials?>.loading());
    });

    test('loads a previously saved session on construction', () async {
      when(() => service.load()).thenAnswer((_) async => _creds);
      final notifier = AuthNotifier(service);

      await Future.delayed(Duration.zero);

      expect(notifier.state.valueOrNull, _creds);
    });

    test('resolves to null data when no session was saved', () async {
      when(() => service.load()).thenAnswer((_) async => null);
      final notifier = AuthNotifier(service);

      await Future.delayed(Duration.zero);

      expect(notifier.state.hasValue, isTrue);
      expect(notifier.state.valueOrNull, isNull);
    });
  });

  group('AuthNotifier.logout', () {
    test('clears storage and resets state to null', () async {
      when(() => service.load()).thenAnswer((_) async => _creds);
      when(() => service.clear()).thenAnswer((_) async {});
      final notifier = AuthNotifier(service);
      await Future.delayed(Duration.zero);

      await notifier.logout();

      verify(() => service.clear()).called(1);
      expect(notifier.state.valueOrNull, isNull);
    });
  });
}
