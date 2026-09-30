import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/providers/providers.dart';
import 'package:riffplayer_mobile/screens/downloads_screen.dart';
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
    when(() => handler.insertAt(any(), any())).thenAnswer((_) async {});

    when(() => downloads.localPath(any())).thenAnswer((_) async => null);
    when(() => downloads.getDownloadedPlaylists()).thenAnswer((_) async => []);
    when(() => client.streamUrl(any())).thenReturn('http://test/stream');
    when(() => client.scrobble(any(), submission: any(named: 'submission')))
        .thenAnswer((_) async {});
  });

  Future<PlayerNotifier> pumpDownloadsScreen(
    WidgetTester tester,
    List<DownloadedTrack> tracks,
  ) async {
    when(() => downloads.getDownloads()).thenAnswer((_) async => tracks);
    final notifier = PlayerNotifier(handler);

    final router = GoRouter(
      initialLocation: '/downloads',
      routes: [
        GoRoute(
            path: '/downloads', builder: (_, __) => const DownloadsScreen()),
        GoRoute(
          path: '/downloads/playlists/:id',
          builder: (_, state) => Scaffold(
              body: Text('Playlist detail: ${state.pathParameters['id']}')),
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
    // Two FutureProviders now back this screen (downloads +
    // downloadedPlaylists) — one pump isn't reliably enough for both to
    // resolve, unlike when there was only one.
    await tester.pump();
    await tester.pump();
    return notifier;
  }

  // Regression test: tapping a row in the Downloads list used to do nothing
  // at all — the underlying ListTile had no onTap wired up, so a downloaded
  // track could be seen but never played from this screen.
  testWidgets('tapping a downloaded track plays it', (tester) async {
    final a = _download('a', title: 'Song A');
    final b = _download('b', title: 'Song B');
    await pumpDownloadsScreen(tester, [a, b]);

    await tester.tap(find.text('Song A'));
    await tester.pump();

    verify(() => handler.playQueue(any(), 0)).called(1);
  });

  testWidgets('tapping plays through the full downloaded list as the queue',
      (tester) async {
    final a = _download('a', title: 'Song A');
    final b = _download('b', title: 'Song B');
    final notifier = await pumpDownloadsScreen(tester, [a, b]);

    await tester.tap(find.text('Song B'));
    await tester.pump();

    expect(notifier.state.queue.map((s) => s.id), ['a', 'b']);
    expect(notifier.state.currentIndex, 1);
  });

  // Regression test: the overflow menu used to be a bare delete IconButton
  // with no "Add to queue"/"Add to playlist" options at all, unlike every
  // other track row (SongTile) in the app.
  group('overflow menu', () {
    testWidgets('Remove download still asks for confirmation and deletes',
        (tester) async {
      final a = _download('a', title: 'Song A');
      when(() => downloads.deleteDownload('a')).thenAnswer((_) async {});
      await pumpDownloadsScreen(tester, [a]);

      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove download'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();

      verify(() => downloads.deleteDownload('a')).called(1);
    });

    testWidgets('Add to queue adds the track to the player queue',
        (tester) async {
      final a = _download('a', title: 'Song A');
      final notifier = await pumpDownloadsScreen(tester, [a]);

      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add to queue'));
      await tester.pump();

      expect(notifier.state.queue.map((s) => s.id), ['a']);
    });

    testWidgets('Add to playlist opens the add-to-playlist dialog',
        (tester) async {
      when(() => client.getPlaylists()).thenAnswer((_) async => []);
      final a = _download('a', title: 'Song A');
      await pumpDownloadsScreen(tester, [a]);

      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add to playlist'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
    });
  });

  testWidgets('swiping a row right adds it to the player queue',
      (tester) async {
    final a = _download('a', title: 'Song A');
    final notifier = await pumpDownloadsScreen(tester, [a]);

    await tester.timedDrag(
      find.byType(ListTile),
      const Offset(400, 0),
      const Duration(milliseconds: 300),
    );
    await tester.pumpAndSettle();

    expect(notifier.state.queue.map((s) => s.id), ['a']);
  });

  // Feature request: downloaded playlists should show up above the flat
  // "downloaded songs" list, not just be indistinguishable from individual
  // downloads.
  group('Downloaded Playlists section', () {
    testWidgets('shows downloaded playlists above a "Downloaded Songs" section',
        (tester) async {
      when(() => downloads.getDownloadedPlaylists()).thenAnswer((_) async => [
            DownloadedPlaylist(
              playlistId: 'p1',
              name: 'My Mix',
              downloadedAt: DateTime(2026),
              trackCount: 3,
            ),
          ]);
      final a = _download('a', title: 'Song A');
      await pumpDownloadsScreen(tester, [a]);

      // _SectionHeader renders its title uppercased.
      expect(find.text('DOWNLOADED PLAYLISTS'), findsOneWidget);
      expect(find.text('My Mix'), findsOneWidget);
      expect(find.text('3 tracks'), findsOneWidget);
      expect(find.text('DOWNLOADED SONGS'), findsOneWidget);
      expect(find.text('Song A'), findsOneWidget);
    });

    testWidgets('is absent when nothing has been downloaded as a playlist',
        (tester) async {
      final a = _download('a', title: 'Song A');
      await pumpDownloadsScreen(tester, [a]);

      expect(find.text('DOWNLOADED PLAYLISTS'), findsNothing);
    });

    testWidgets('tapping a downloaded playlist opens its detail screen',
        (tester) async {
      when(() => downloads.getDownloadedPlaylists()).thenAnswer((_) async => [
            DownloadedPlaylist(
              playlistId: 'p1',
              name: 'My Mix',
              downloadedAt: DateTime(2026),
              trackCount: 0,
            ),
          ]);
      await pumpDownloadsScreen(tester, []);

      await tester.tap(find.text('My Mix'));
      await tester.pumpAndSettle();

      expect(find.text('Playlist detail: p1'), findsOneWidget);
    });
  });
}
