import 'package:flutter_test/flutter_test.dart';
import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/providers/providers.dart';

Song _song(String id) => Song(
      id: id,
      title: 'Title $id',
      artist: 'Artist',
      artistId: 'artist-1',
      album: 'Album',
      albumId: 'album-1',
      suffix: 'mp3',
    );

void main() {
  group('PlayerState.currentSong', () {
    test('is null when currentIndex is -1 (nothing playing)', () {
      const state = PlayerState();
      expect(state.currentSong, isNull);
    });

    test('is null when currentIndex is out of range', () {
      final state = PlayerState(queue: [_song('a')], currentIndex: 5);
      expect(state.currentSong, isNull);
    });

    test('returns the song at currentIndex', () {
      final queue = [_song('a'), _song('b'), _song('c')];
      final state = PlayerState(queue: queue, currentIndex: 1);
      expect(state.currentSong?.id, 'b');
    });
  });

  group('PlayerState.copyWith', () {
    test('overrides only the given fields, keeping the rest', () {
      final original = PlayerState(
        queue: [_song('a')],
        currentIndex: 0,
        playing: true,
        position: const Duration(seconds: 10),
        duration: const Duration(minutes: 3),
        shuffle: true,
      );

      final updated = original.copyWith(playing: false);

      expect(updated.playing, isFalse);
      expect(updated.queue, original.queue);
      expect(updated.currentIndex, original.currentIndex);
      expect(updated.position, original.position);
      expect(updated.duration, original.duration);
      expect(updated.shuffle, original.shuffle);
    });

    test('an empty queue list is a real override, not treated as absent', () {
      final original = PlayerState(queue: [_song('a')], currentIndex: 0);
      final updated = original.copyWith(queue: [], currentIndex: -1);
      expect(updated.queue, isEmpty);
      expect(updated.currentIndex, -1);
    });
  });
}
