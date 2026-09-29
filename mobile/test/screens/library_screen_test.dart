import 'package:cadence_mobile/providers/providers.dart';
import 'package:cadence_mobile/screens/library_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

import '../helpers/mocks.dart';

void main() {
  late MockSubsonicClient client;

  setUp(() {
    client = MockSubsonicClient();
  });

  Future<void> pumpLibraryScreen(WidgetTester tester) async {
    final router = GoRouter(
      initialLocation: '/library',
      routes: [
        GoRoute(
          path: '/library',
          builder: (_, __) => const LibraryScreen(),
        ),
        GoRoute(
          path: '/downloads',
          builder: (_, __) =>
              const Scaffold(body: Text('Downloads Screen')),
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(client)],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pump();
  }

  // Regression test: LibraryScreen used to gate its *entire* body on the
  // playlists fetch (`playlistsAsync.when(... error: (e,_) => Text('Error:
  // $e'), ...)`), which meant a network failure — e.g. genuinely offline —
  // hid every system row, including Downloaded, behind a plain error
  // message. Downloaded is specifically the one row offline users need to
  // reach, since it's backed by local SQLite and doesn't need a connection
  // itself. System rows must render regardless of whether playlists loaded.
  testWidgets(
      'Downloaded (and the other system rows) still render when the '
      'playlists fetch fails, e.g. while offline', (tester) async {
    when(() => client.getPlaylists()).thenThrow(Exception('Network error'));
    when(() => client.getLibrarySidebarState())
        .thenThrow(Exception('Network error'));

    await pumpLibraryScreen(tester);
    await tester.pump();

    expect(find.text('Downloaded'), findsOneWidget);
    expect(find.text('Albums'), findsOneWidget);
    expect(find.text('All Songs'), findsOneWidget);
    expect(find.text('Favourites'), findsOneWidget);
    // The screen should not have collapsed to a blocking full-screen error.
    expect(find.textContaining('Error:'), findsNothing);
  });

  testWidgets('tapping Downloaded navigates to the downloads route even '
      'when recordLibraryInteraction fails offline', (tester) async {
    when(() => client.getPlaylists()).thenThrow(Exception('Network error'));
    when(() => client.getLibrarySidebarState())
        .thenThrow(Exception('Network error'));
    // A real network failure arrives as a rejected Future (Dio is async),
    // not a synchronous throw — thenAnswer here, not thenThrow, to match.
    when(() => client.recordLibraryInteraction(any(), any()))
        .thenAnswer((_) async => throw Exception('Network error'));

    await pumpLibraryScreen(tester);
    await tester.pump();

    await tester.tap(find.text('Downloaded'));
    await tester.pumpAndSettle();

    expect(find.text('Downloads Screen'), findsOneWidget);
  });

  testWidgets('playlists render normally when the fetch succeeds',
      (tester) async {
    when(() => client.getPlaylists()).thenAnswer((_) async => []);
    when(() => client.getLibrarySidebarState()).thenAnswer((_) async => []);

    await pumpLibraryScreen(tester);
    await tester.pump();

    expect(find.text('Downloaded'), findsOneWidget);
    expect(find.textContaining('unavailable'), findsNothing);
  });
}
