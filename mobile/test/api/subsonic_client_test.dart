import 'package:cadence_mobile/api/subsonic.dart';
import 'package:cadence_mobile/api/types.dart';
import 'package:flutter_test/flutter_test.dart';

const _creds = Credentials(
  serverUrl: 'http://example.com:4533',
  username: 'alice',
  password: 'hunter2',
);

Map<String, String> _queryParams(String url) => Uri.parse(url).queryParameters;

void main() {
  group('SubsonicClient.streamUrl', () {
    test('points at stream.view under the server URL', () {
      final client = SubsonicClient(_creds);
      final url = client.streamUrl('track-1');
      expect(url, startsWith('http://example.com:4533/rest/stream.view?'));
    });

    test('carries the track id and standard Subsonic auth params', () {
      final client = SubsonicClient(_creds);
      final params = _queryParams(client.streamUrl('track-1'));

      expect(params['id'], 'track-1');
      expect(params['u'], 'alice');
      expect(params['v'], '1.16.1');
      expect(params['c'], 'cadence-flutter');
      expect(params['f'], 'json');
      // Token/salt are randomly salted per client instance (see the class's
      // own doc comment on why) — just assert they're present, not a value.
      expect(params['t'], isNotEmpty);
      expect(params['s'], isNotEmpty);
    });

    test('reuses the same salt/token across calls on the same client', () {
      // The salt is deterministic per *instance* (computed once, lazily) —
      // this is what makes coverArtUrl-derived cache keys stable rather than
      // busting the image cache on every rebuild.
      final client = SubsonicClient(_creds);
      final first = _queryParams(client.streamUrl('a'));
      final second = _queryParams(client.streamUrl('b'));

      expect(second['t'], first['t']);
      expect(second['s'], first['s']);
    });
  });

  group('SubsonicClient.coverArtUrl', () {
    test('omits size when not given', () {
      final client = SubsonicClient(_creds);
      final params = _queryParams(client.coverArtUrl('cover-1'));

      expect(params['id'], 'cover-1');
      expect(params.containsKey('size'), isFalse);
    });

    test('includes size when given', () {
      final client = SubsonicClient(_creds);
      final params = _queryParams(client.coverArtUrl('cover-1', size: 300));

      expect(params['size'], '300');
    });
  });
}
