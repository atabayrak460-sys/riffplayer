import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/screens/playlist_detail_screen.dart';
import 'package:flutter_test/flutter_test.dart';

Song _song(String id) => Song(
      id: id,
      title: 'Title $id',
      artist: 'Artist',
      artistId: 'artist-1',
      album: 'Album',
      albumId: 'album-1',
      suffix: 'mp3',
    );

List<String> _ids(List<Song> songs) => songs.map((s) => s.id).toList();

void main() {
  final a = _song('a');
  final b = _song('b');
  final c = _song('c');
  final songs = [a, b, c];
  final dates = {
    'a': DateTime(2024, 3, 1),
    'b': DateTime(2024, 1, 1),
    'c': DateTime(2024, 2, 1),
  };

  group('sortPlaylistSongs', () {
    test('custom mode keeps the playlist order', () {
      expect(_ids(sortPlaylistSongs(songs, dates, PlaylistSortMode.custom)),
          ['a', 'b', 'c']);
    });

    test('addedAsc sorts oldest first', () {
      expect(_ids(sortPlaylistSongs(songs, dates, PlaylistSortMode.addedAsc)),
          ['b', 'c', 'a']);
    });

    test('addedDesc sorts newest first', () {
      expect(_ids(sortPlaylistSongs(songs, dates, PlaylistSortMode.addedDesc)),
          ['a', 'c', 'b']);
    });

    test('keeps the original order while dates have not loaded yet', () {
      expect(_ids(sortPlaylistSongs(songs, null, PlaylistSortMode.addedAsc)),
          ['a', 'b', 'c']);
    });

    test('does not mutate the input list', () {
      sortPlaylistSongs(songs, dates, PlaylistSortMode.addedAsc);
      expect(_ids(songs), ['a', 'b', 'c']);
    });

    test('empty list stays empty', () {
      expect(sortPlaylistSongs([], dates, PlaylistSortMode.addedDesc), isEmpty);
    });

    group('songs with a missing date', () {
      final d = _song('d');
      final e = _song('e');
      final mixed = [a, d, b, e, c];
      final partial = {
        'a': DateTime(2024, 3, 1),
        'b': DateTime(2024, 1, 1),
        'c': DateTime(2024, 2, 1),
      };

      test('addedAsc sorts the dated songs and puts undated ones last', () {
        expect(
            _ids(sortPlaylistSongs(mixed, partial, PlaylistSortMode.addedAsc)),
            ['b', 'c', 'a', 'd', 'e']);
      });

      test('addedDesc sorts the dated songs and puts undated ones last', () {
        expect(
            _ids(sortPlaylistSongs(mixed, partial, PlaylistSortMode.addedDesc)),
            ['a', 'c', 'b', 'd', 'e']);
      });
    });
  });
}
