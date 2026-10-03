import 'package:dio/dio.dart';
import 'package:riffplayer_mobile/api/subsonic.dart';
import 'package:riffplayer_mobile/api/types.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_http.dart';

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
      expect(params['c'], 'riffplayer-flutter');
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

  group('saved play queue (resume where you left off)', () {
    late FakeAdapter adapter;
    late SubsonicClient client;

    setUp(() {
      adapter = FakeAdapter();
      final dio = Dio(BaseOptions(validateStatus: (_) => true))
        ..httpClientAdapter = adapter;
      client = SubsonicClient(_creds, dio: dio);
    });

    Map<String, dynamic> songJson(String id) => {
          'id': id,
          'title': 'T $id',
          'artist': 'A',
          'artistId': 'a1',
          'album': 'B',
          'albumId': 'b1',
          'suffix': 'mp3',
        };

    test(
        'savePlayQueue POSTs the ids as a JSON body (a long queue would not fit in a URL), auth in the query',
        () async {
      adapter.responder = (_) => subsonic({});

      await client
          .savePlayQueue(['3', '1', '2'], current: '1', positionMs: 83500);

      expect(adapter.last.method, 'POST');
      expect(adapter.last.uri.path, '/rest/savePlayQueue.view');
      expect(adapter.last.uri.queryParameters['u'], 'alice');
      expect(adapter.last.uri.queryParameters.containsKey('id'), isFalse);
      expect(adapter.last.data, {
        'id': ['3', '1', '2'],
        'current': '1',
        'position': '83500'
      });
    });

    test('savePlayQueue leaves out `current` when there is none', () async {
      adapter.responder = (_) => subsonic({});
      await client.savePlayQueue(['1']);
      expect(adapter.last.data, {
        'id': ['1'],
        'position': '0'
      });
    });

    test('savePlayQueue throws when the server refuses', () async {
      adapter.responder = (_) => subsonic({
            'error': {'message': 'nope'}
          }, status: 'failed');
      expect(client.savePlayQueue(['1']),
          throwsA(predicate((e) => e.toString().contains('nope'))));
    });

    test('getPlayQueue returns the saved songs, current id, position and time',
        () async {
      adapter.responder = (_) => subsonic({
            'playQueue': {
              'current': '2',
              'position': 42000,
              'changed': '2026-10-03T10:00:00Z',
              'entry': [songJson('1'), songJson('2')],
            },
          });

      final q = await client.getPlayQueue();

      expect(q?.songs.map((s) => s.id), ['1', '2']);
      expect((q?.current, q?.positionMs), ('2', 42000));
      expect(q?.changed, DateTime.utc(2026, 10, 3, 10));
    });

    test(
        'getPlayQueue is null when nothing was saved, or the saved queue is empty',
        () async {
      adapter.responder = (_) => subsonic({});
      expect(await client.getPlayQueue(), isNull);

      adapter.responder = (_) => subsonic({
            'playQueue': {'entry': []}
          });
      expect(await client.getPlayQueue(), isNull);
    });

    test('getPlayQueue tolerates a missing position and time', () async {
      adapter.responder = (_) => subsonic({
            'playQueue': {
              'entry': [songJson('1')]
            }
          });
      final q = await client.getPlayQueue();
      expect(q?.positionMs, 0);
      expect(q?.changed, isNull);
    });
  });
}
