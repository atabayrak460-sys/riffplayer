import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/providers/providers.dart';
import 'package:riffplayer_mobile/screens/downloaded_playlist_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

import '../helpers/mocks.dart';

DownloadedTrack _download(String id, {String title = 'Title'}) =>
    DownloadedTrack(
      trackId: id,
      localPath: '/downloads/$id.mp3',
      title: title,
      artist: 'Artist',
      album: 'Album',
      downloadedAt: DateTime(2026),
    );

DownloadedPlaylist _playlist({
  String id = 'p1',
  String name = 'My Mix',
  String? comment,
}) =>
    DownloadedPlaylist(
      playlistId: id,
      name: name,
      comment: comment,
      downloadedAt: DateTime(2026),
      trackCount: 0,
    );

void main() {
  setUpAll(registerMockFallbackValues);

  late MockAudioHandler handler;
  late MockSubsonicClient client;
  late MockDownloadService downloads;

  setUp(() {
    handler = MockAudioHandler();
    client = MockSubsonicClient();
    downloads = MockDownloadService();

    when(() => handler.positionStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.durationStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.playingStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.currentIndexStream)
        .thenAnswer((_) => const Stream.empty());
    when(() => handler.shuffleModeEnabledStream)
        .thenAnswer((_) => const Stream.empty());
    when(() => handler.loopModeStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.playQueue(any(), any())).thenAnswer((_) async {});

    when(() => downloads.localPath(any())).thenAnswer((_) async => null);
    when(() => client.streamUrl(any())).thenReturn('http://test/stream');
    when(() => client.scrobble(any(), submission: any(named: 'submission')))
        .thenAnswer((_) async {});
  });

  Future<PlayerNotifier> pumpScreen(
    WidgetTester tester, {
    DownloadedPlaylist? playlist,
    List<DownloadedTrack> tracks = const [],
  }) async {
    when(() => downloads.getDownloadedPlaylist('p1'))
        .thenAnswer((_) async => playlist);
    when(() => downloads.getDownloadedPlaylistTracks('p1'))
        .thenAnswer((_) async => tracks);
    final notifier = PlayerNotifier(handler);

    final router = GoRouter(
      initialLocation: '/downloads',
      routes: [
        GoRoute(
            path: '/downloads',
            builder: (_, __) => const Scaffold(body: Text('Downloads'))),
        GoRoute(
          path: '/downloads/playlists/:id',
          builder: (_, state) => DownloadedPlaylistDetailScreen(
              playlistId: state.pathParameters['id']!),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          playerProvider.overrideWith((ref) => notifier),
          apiClientProvider.overrideWithValue(client),
          downloadServiceProvider.overrideWithValue(downloads),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
    // Mirror real navigation (DownloadsScreen pushes into the detail
    // screen) so `context.pop()` in the delete flow has somewhere to go
    // back to — starting directly on the detail route leaves nothing to
    // pop, unlike the app's actual usage. pumpAndSettle so the push
    // transition (and both FutureProviders backing this screen) fully
    // finish before a test interacts with it.
    router.push('/downloads/playlists/p1');
    await tester.pumpAndSettle();
    return notifier;
  }

  testWidgets('renders the playlist name, comment, and track list',
      (tester) async {
    await pumpScreen(
      tester,
      playlist: _playlist(comment: 'Songs for a road trip'),
      tracks: [_download('a', title: 'Song A')],
    );

    expect(find.text('My Mix'), findsWidgets); // AppBar title + heading
    expect(find.text('Songs for a road trip'), findsOneWidget);
    expect(find.text('1 track available offline'), findsOneWidget);
    expect(find.text('Song A'), findsOneWidget);
  });

  testWidgets('shows a "gone" message when the playlist no longer exists',
      (tester) async {
    await pumpScreen(tester, playlist: null);

    expect(find.text('This downloaded playlist is gone.'), findsOneWidget);
  });

  testWidgets('tapping a track plays it, queueing the whole playlist',
      (tester) async {
    final a = _download('a', title: 'Song A');
    final b = _download('b', title: 'Song B');
    final notifier =
        await pumpScreen(tester, playlist: _playlist(), tracks: [a, b]);

    await tester.tap(find.text('Song B'));
    await tester.pump();

    expect(notifier.state.queue.map((s) => s.id), ['a', 'b']);
    expect(notifier.state.currentIndex, 1);
  });

  testWidgets('Play button plays from the first track', (tester) async {
    final a = _download('a', title: 'Song A');
    final b = _download('b', title: 'Song B');
    final notifier =
        await pumpScreen(tester, playlist: _playlist(), tracks: [a, b]);

    await tester.tap(find.text('Play'));
    await tester.pump();

    expect(notifier.state.queue.map((s) => s.id), ['a', 'b']);
    expect(notifier.state.currentIndex, 0);
  });

  testWidgets(
      'the delete action asks for confirmation, deletes, and navigates back',
      (tester) async {
    when(() => downloads.deleteDownloadedPlaylist('p1'))
        .thenAnswer((_) async {});
    await pumpScreen(tester, playlist: _playlist());

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    verify(() => downloads.deleteDownloadedPlaylist('p1')).called(1);
    expect(find.text('Downloads'), findsOneWidget);
  });

  testWidgets('cancelling the delete confirmation deletes nothing',
      (tester) async {
    await pumpScreen(tester, playlist: _playlist());

    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    verifyNever(() => downloads.deleteDownloadedPlaylist(any()));
    expect(find.text('My Mix'), findsWidgets);
  });
}
