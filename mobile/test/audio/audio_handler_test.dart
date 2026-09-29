import 'package:cadence_mobile/api/subsonic.dart';
import 'package:cadence_mobile/api/types.dart';
import 'package:cadence_mobile/audio/audio_handler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:mocktail/mocktail.dart';

import '../helpers/mocks.dart';

const _creds = Credentials(
  serverUrl: 'http://example.com:4533',
  username: 'alice',
  password: 'hunter2',
);

Song _song(
  String id, {
  String? coverArt,
  int? duration,
  double? replayGainTrackGain,
}) =>
    Song(
      id: id,
      title: 'Title $id',
      artist: 'Artist',
      artistId: 'artist-1',
      album: 'Album',
      albumId: 'album-1',
      suffix: 'mp3',
      coverArt: coverArt,
      duration: duration,
      replayGainTrackGain: replayGainTrackGain,
    );

void main() {
  setUpAll(registerMockFallbackValues);

  final client = SubsonicClient(_creds);

  group('songToMediaItem', () {
    test('maps the basic fields straight across', () {
      final song = _song('t1', duration: 200);
      final item = songToMediaItem(song, client);

      expect(item.id, 't1');
      expect(item.title, song.title);
      expect(item.artist, song.artist);
      expect(item.album, song.album);
      expect(item.duration, const Duration(seconds: 200));
    });

    test('duration is null when the song has none', () {
      final song = _song('t1', duration: null);
      expect(songToMediaItem(song, client).duration, isNull);
    });

    test('artUri is null when there is no cover art', () {
      final song = _song('t1', coverArt: null);
      expect(songToMediaItem(song, client).artUri, isNull);
    });

    test('artUri is built from the client when cover art is present', () {
      final song = _song('t1', coverArt: 'cover-1');
      final uri = songToMediaItem(song, client).artUri;

      expect(uri, isNotNull);
      expect(uri!.queryParameters['id'], 'cover-1');
      expect(uri.queryParameters['size'], '300');
    });

    test('carries replayGainTrackGain and songId through extras', () {
      final song = _song('t1', replayGainTrackGain: -4.5);
      final extras = songToMediaItem(song, client).extras!;

      expect(extras['replayGainTrackGain'], -4.5);
      expect(extras['songId'], 't1');
    });
  });

  group('buildAudioSource', () {
    late MockDownloadService downloads;

    setUp(() {
      downloads = MockDownloadService();
    });

    test('streams from the server when the song is not downloaded', () async {
      when(() => downloads.localPath(any())).thenAnswer((_) async => null);
      final song = _song('t1');

      final source = await buildAudioSource(song, client, downloads);

      expect(source.sequence, hasLength(1));
      final uri = (source.sequence.single as UriAudioSource).uri;
      expect(uri.scheme, 'http');
      expect(uri.queryParameters['id'], 't1');
    });

    test('plays the local file when the song is downloaded', () async {
      when(() => downloads.localPath('t1'))
          .thenAnswer((_) async => '/downloads/t1.mp3');
      final song = _song('t1');

      final source = await buildAudioSource(song, client, downloads);

      final uri = (source.sequence.single as UriAudioSource).uri;
      expect(uri, Uri.file('/downloads/t1.mp3'));
    });
  });
}
