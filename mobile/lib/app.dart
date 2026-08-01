import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/providers.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/home_page_screen.dart';
import 'screens/albums_screen.dart';
import 'screens/album_detail_screen.dart';
import 'screens/artists_screen.dart';
import 'screens/artist_detail_screen.dart';
import 'screens/search_screen.dart';
import 'screens/favorites_screen.dart';
import 'screens/downloads_screen.dart';
import 'screens/library_screen.dart';
import 'screens/playlist_detail_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/player_screen.dart';
import 'screens/wrapped_screen.dart';
import 'screens/discover_screen.dart';
import 'screens/recently_played_screen.dart';
import 'screens/most_played_screen.dart';
import 'screens/admin_screen.dart';
import 'theme.dart';

// Notifies GoRouter to re-run `redirect` whenever auth state changes.
class _AuthRefreshNotifier extends ChangeNotifier {
  void notify() => notifyListeners();
}

class CadenceApp extends ConsumerStatefulWidget {
  const CadenceApp({super.key});

  @override
  ConsumerState<CadenceApp> createState() => _CadenceAppState();
}

class _CadenceAppState extends ConsumerState<CadenceApp> {
  final _authRefresh = _AuthRefreshNotifier();
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    ref.listenManual(authProvider, (_, __) => _authRefresh.notify());

    _router = GoRouter(
      initialLocation: '/login',
      refreshListenable: _authRefresh,
      redirect: (context, state) {
        final auth = ref.read(authProvider);
        if (auth.isLoading) return null; // wait for the stored session to load

        final loggedIn = auth.valueOrNull != null;
        final atLogin = state.matchedLocation == '/login';

        if (!loggedIn && !atLogin) return '/login';
        if (loggedIn && atLogin) return '/home';
        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),

        // Full-screen player (outside the shell)
        GoRoute(path: '/player', builder: (_, __) => const PlayerScreen()),

        // Shell with bottom nav + mini player
        ShellRoute(
          builder: (_, __, child) => HomeScreen(child: child),
          routes: [
            GoRoute(path: '/home', builder: (_, __) => const HomePageScreen()),
            GoRoute(path: '/albums', builder: (_, __) => const AlbumsScreen()),
            GoRoute(
              path: '/albums/:id',
              builder: (_, state) =>
                  AlbumDetailScreen(albumId: state.pathParameters['id']!),
            ),
            GoRoute(path: '/artists', builder: (_, __) => const ArtistsScreen()),
            GoRoute(
              path: '/artists/:id',
              builder: (_, state) =>
                  ArtistDetailScreen(artistId: state.pathParameters['id']!),
            ),
            GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
            GoRoute(path: '/favorites', builder: (_, __) => const FavoritesScreen()),
            GoRoute(path: '/downloads', builder: (_, __) => const DownloadsScreen()),
            GoRoute(path: '/library', builder: (_, __) => const LibraryScreen()),
            GoRoute(
              path: '/playlists/:id',
              builder: (_, state) =>
                  PlaylistDetailScreen(playlistId: state.pathParameters['id']!),
            ),
            GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
            GoRoute(path: '/wrapped', builder: (_, __) => const WrappedScreen()),
            GoRoute(path: '/discover', builder: (_, __) => const DiscoverScreen()),
            GoRoute(path: '/recent', builder: (_, __) => const RecentlyPlayedScreen()),
            GoRoute(path: '/most-played', builder: (_, __) => const MostPlayedScreen()),
            GoRoute(path: '/admin', builder: (_, __) => const AdminScreen()),
          ],
        ),
      ],
    );
  }

  @override
  void dispose() {
    _authRefresh.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Cadence',
      theme: buildTheme(),
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
