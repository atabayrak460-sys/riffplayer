import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/providers/providers.dart';
import 'package:riffplayer_mobile/widgets/add_to_playlist_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../helpers/mocks.dart';

Song _song(String id) => Song(
      id: id,
      title: 'Title $id',
      artist: 'Artist',
      artistId: 'artist-1',
      album: 'Album',
      albumId: 'album-1',
      suffix: 'mp3',
      duration: 200,
    );

Playlist _playlist({List<Song>? entries}) => Playlist(
      id: 'p-1',
      name: 'My Playlist',
      owner: 'admin',
      songCount: entries?.length ?? 0,
      duration: 0,
      entries: entries,
    );

void main() {
  late MockSubsonicClient client;

  setUp(() {
    client = MockSubsonicClient();
    when(() => client.getPlaylists()).thenAnswer((_) async => [_playlist()]);
    when(() => client.addSongToPlaylist(any(), any())).thenAnswer((_) async {});
  });

  Future<void> openDialogAndPick(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(client)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showDialog(
                  context: context,
                  builder: (_) => const AddToPlaylistDialog(songId: 's-1'),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My Playlist'));
    await tester.pumpAndSettle();
  }

  testWidgets('adds a song that is not in the playlist yet', (tester) async {
    when(() => client.getPlaylist('p-1'))
        .thenAnswer((_) async => _playlist(entries: [_song('other')]));

    await openDialogAndPick(tester);

    verify(() => client.addSongToPlaylist('p-1', 's-1')).called(1);
    expect(find.byType(AddToPlaylistDialog), findsNothing);
    expect(find.text('Already in "My Playlist"'), findsNothing);
  });

  testWidgets('does not re-add a song already in the playlist, shows a snackbar',
      (tester) async {
    when(() => client.getPlaylist('p-1'))
        .thenAnswer((_) async => _playlist(entries: [_song('s-1')]));

    await openDialogAndPick(tester);

    verifyNever(() => client.addSongToPlaylist(any(), any()));
    expect(find.byType(AddToPlaylistDialog), findsNothing);
    expect(find.text('Already in "My Playlist"'), findsOneWidget);
  });
}
