import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'providers/providers.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/albums_screen.dart';
import 'screens/album_detail_screen.dart';
import 'screens/artists_screen.dart';
import 'screens/artist_detail_screen.dart';
import 'screens/search_screen.dart';
import 'screens/favorites_screen.dart';
import 'screens/downloads_screen.dart';
import 'screens/player_screen.dart';
import 'theme.dart';

final _router = GoRouter(
  initialLocation: '/albums',
  redirect: (context, state) {
    // If not authenticated, send to login (except from login itself)
    // Handled in _routerWithAuth below
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
      ],
    ),
  ],
);

class CadenceApp extends ConsumerWidget {
  const CadenceApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Listen for auth state and redirect accordingly
    ref.listen<AsyncValue<Credentials?>>(authProvider, (_, next) {
      next.whenData((creds) {
        if (creds == null && _router.routerDelegate.currentConfiguration.uri.path != '/login') {
          _router.go('/login');
        } else if (creds != null && _router.routerDelegate.currentConfiguration.uri.path == '/login') {
          _router.go('/albums');
        }
      });
    });

    return MaterialApp.router(
      title: 'Cadence',
      theme: buildTheme(),
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
