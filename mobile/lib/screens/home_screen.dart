import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/mini_player.dart';

class HomeScreen extends ConsumerStatefulWidget {
  final Widget child;
  const HomeScreen({super.key, required this.child});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _currentIndex = 0;
  GoRouter? _router;

  static const _tabs = ['/home', '/artists', '/search', '/library', '/settings'];

  /// Everything reachable from the Library tab shares its highlight, even
  /// when pushed directly (e.g. tapping a Library row, or Home's "View all
  /// playlists" link) rather than via [_onTabTap].
  static const _libraryPrefixes = [
    '/library', '/favorites', '/recent', '/most-played', '/downloads', '/playlists', '/discover', '/wrapped',
  ];

  static int? _indexForLocation(String location) {
    if (location.startsWith('/home')) return 0;
    if (location.startsWith('/artists')) return 1;
    if (location.startsWith('/search')) return 2;
    if (_libraryPrefixes.any(location.startsWith)) return 3;
    if (location.startsWith('/settings')) return 4;
    return null; // e.g. /albums, /admin — not a bottom-nav destination
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // `ShellRoute.builder` (and thus this widget's `build`) only reruns for
    // top-level `.go()` navigation — pushing a sibling route (`.push()`)
    // updates `widget.child` without rebuilding this ambient wrapper, so
    // reading the route from `widget`/`GoRouterState.of(context)` here goes
    // stale on pushes. `GoRouterDelegate` is a `ChangeNotifier` that fires on
    // every navigation regardless, so listen to it directly instead.
    final router = GoRouter.of(context);
    if (!identical(router, _router)) {
      _router?.routerDelegate.removeListener(_onRouteChanged);
      _router = router;
      _router!.routerDelegate.addListener(_onRouteChanged);
      _currentIndex = _indexForLocation(_router!.routerDelegate.state.matchedLocation) ?? _currentIndex;
    }
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_onRouteChanged);
    super.dispose();
  }

  void _onRouteChanged() {
    final index = _indexForLocation(_router!.routerDelegate.state.matchedLocation);
    if (index != null && index != _currentIndex && mounted) {
      setState(() => _currentIndex = index);
    }
  }

  void _onTabTap(int index) {
    context.go(_tabs[index]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Expanded(child: widget.child),
          const MiniPlayer(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: _onTabTap,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.people), label: 'Artists'),
          BottomNavigationBarItem(icon: Icon(Icons.search), label: 'Search'),
          BottomNavigationBarItem(icon: Icon(Icons.library_music), label: 'Library'),
          BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}
