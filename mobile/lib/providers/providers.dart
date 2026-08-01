import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import '../api/types.dart';
import '../api/subsonic.dart';
import '../services/auth_service.dart';
import '../services/download_service.dart';
import '../audio/audio_handler.dart';

// ── Services ──────────────────────────────────────────────────────────────────

final authServiceProvider = Provider((_) => AuthService());
final downloadServiceProvider = Provider((_) => DownloadService());

// ── Audio handler (overridden in main with the initialized singleton) ─────────

final audioHandlerProvider = Provider<CadenceAudioHandler>(
  (_) => throw UnimplementedError('Override in ProviderScope'),
);

// ── Auth ──────────────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AsyncValue<Credentials?>> {
  final AuthService _svc;

  AuthNotifier(this._svc) : super(const AsyncValue.loading()) {
    _load();
  }

  Future<void> _load() async {
    state = AsyncValue.data(await _svc.load());
  }

  Future<void> login(Credentials creds) async {
    // Verify credentials by pinging
    final client = SubsonicClient(creds);
    await client.ping();

    // Optionally get a JWT from the custom API
    Credentials saved = creds;
    try {
      final r = await client.loginCustomApi(creds.username, creds.password);
      if (r != null) saved = creds.copyWith(token: r);
    } catch (_) {
      // JWT login optional — Subsonic auth still works
    }

    await _svc.save(saved);
    state = AsyncValue.data(saved);
  }

  Future<void> logout() async {
    await _svc.clear();
    state = const AsyncValue.data(null);
  }
}

final authProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<Credentials?>>(
  (ref) => AuthNotifier(ref.read(authServiceProvider)),
);

// ── API client derived from credentials ───────────────────────────────────────

final apiClientProvider = Provider<SubsonicClient?>((ref) {
  final auth = ref.watch(authProvider);
  return auth.valueOrNull != null ? SubsonicClient(auth.valueOrNull!) : null;
});

// ── Player state ──────────────────────────────────────────────────────────────

class PlayerState {
  final List<Song> queue;
  final int currentIndex;
  final bool playing;
  final Duration position;
  final Duration duration;
  final bool shuffle;
  final LoopMode repeatMode;

  const PlayerState({
    this.queue = const [],
    this.currentIndex = -1,
    this.playing = false,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.shuffle = false,
    this.repeatMode = LoopMode.off,
  });

  Song? get currentSong =>
      currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  PlayerState copyWith({
    List<Song>? queue,
    int? currentIndex,
    bool? playing,
    Duration? position,
    Duration? duration,
    bool? shuffle,
    LoopMode? repeatMode,
  }) =>
      PlayerState(
        queue: queue ?? this.queue,
        currentIndex: currentIndex ?? this.currentIndex,
        playing: playing ?? this.playing,
        position: position ?? this.position,
        duration: duration ?? this.duration,
        shuffle: shuffle ?? this.shuffle,
        repeatMode: repeatMode ?? this.repeatMode,
      );
}

class PlayerNotifier extends StateNotifier<PlayerState> {
  final CadenceAudioHandler _handler;
  List<Song> _songs = [];

  // "Now playing" scrobbles fire immediately in playSong(); this tracks the
  // one-time "submission" scrobble (counts as a real play) sent once a track
  // crosses 50% played or 30s, whichever comes first — same rule as the web
  // client, so play counts / Wrapped / Most Played agree across platforms.
  SubsonicClient? _scrobbleClient;
  String? _scrobbledSongId;
  String? _nowPlayingSongId;

  PlayerNotifier(this._handler) : super(const PlayerState()) {
    _handler.positionStream.listen((pos) {
      state = state.copyWith(position: pos);
      _maybeScrobble(pos);
    });
    _handler.durationStream.listen((dur) {
      state = state.copyWith(duration: dur ?? Duration.zero);
    });
    _handler.playingStream.listen((playing) {
      state = state.copyWith(playing: playing);
    });
    _handler.currentIndexStream.listen((idx) {
      state = state.copyWith(currentIndex: idx ?? -1);
      // Skipping (next/previous/tap-in-queue) changes the track without going
      // through playSong() — send its "now playing" scrobble here instead.
      final song = state.currentSong;
      final client = _scrobbleClient;
      if (song != null && client != null && _nowPlayingSongId != song.id) {
        _nowPlayingSongId = song.id;
        client.scrobble(song.id, submission: false).ignore();
      }
    });
    _handler.shuffleModeEnabledStream.listen((enabled) {
      state = state.copyWith(shuffle: enabled);
    });
    _handler.loopModeStream.listen((mode) {
      state = state.copyWith(repeatMode: mode);
    });
    _handler.queue.listen((items) {
      // Rebuild queue list from handler queue
      // (songs are stored separately for metadata)
    });
  }

  Future<void> playSong(
    Song song,
    SubsonicClient client,
    DownloadService downloads, {
    List<Song>? queue,
    int? queueIndex,
  }) async {
    final songs = queue ?? [song];
    final idx = queueIndex ?? songs.indexWhere((s) => s.id == song.id);
    _songs = songs;

    final sources = await Future.wait(
      songs.map((s) => buildAudioSource(s, client, downloads)),
    );
    await _handler.playQueue(sources, idx < 0 ? 0 : idx);
    state = state.copyWith(queue: songs, currentIndex: idx < 0 ? 0 : idx);

    // Send "now playing" scrobble
    _scrobbleClient = client;
    _nowPlayingSongId = song.id;
    client.scrobble(song.id, submission: false).ignore();
  }

  void _maybeScrobble(Duration pos) {
    final song = state.currentSong;
    final client = _scrobbleClient;
    if (song == null || client == null || _scrobbledSongId == song.id) return;
    final durationMs = state.duration.inMilliseconds;
    final thresholdMs = durationMs > 0 ? (durationMs * 0.5).clamp(0, 30000).round() : 30000;
    if (pos.inMilliseconds >= thresholdMs) {
      _scrobbledSongId = song.id;
      client.scrobble(song.id, submission: true).ignore();
    }
  }

  Future<void> addToQueue(
    Song song,
    SubsonicClient client,
    DownloadService downloads,
  ) async {
    final source = await buildAudioSource(song, client, downloads);
    await _handler.appendToQueue(source);
    state = state.copyWith(queue: [..._songs, song]);
    _songs = [..._songs, song];
  }

  Future<void> playNext(
    Song song,
    SubsonicClient client,
    DownloadService downloads,
  ) async {
    final source = await buildAudioSource(song, client, downloads);
    await _handler.insertNext(source);
    if (state.currentIndex < 0) {
      // Nothing was playing — insertNext() starts this track from scratch.
      _songs = [song];
      state = state.copyWith(queue: _songs, currentIndex: 0);
      _scrobbleClient = client;
      _nowPlayingSongId = song.id;
      client.scrobble(song.id, submission: false).ignore();
      return;
    }
    final insertAt = state.currentIndex + 1;
    final newSongs = [..._songs.sublist(0, insertAt), song, ..._songs.sublist(insertAt)];
    _songs = newSongs;
    state = state.copyWith(queue: newSongs);
  }

  Future<void> removeFromQueue(int index) async {
    await _handler.removeQueueItemAt(index);
    final newSongs = [..._songs]..removeAt(index);
    _songs = newSongs;
    int newIdx = state.currentIndex;
    if (index < newIdx) newIdx--;
    state = state.copyWith(queue: newSongs, currentIndex: newIdx);
  }

  Future<void> reorderQueue(int from, int to) async {
    await _handler.moveQueueItem(from, to);
    final newSongs = [..._songs];
    final moved = newSongs.removeAt(from);
    newSongs.insert(to, moved);
    _songs = newSongs;
    state = state.copyWith(queue: newSongs);
  }

  void play() => _handler.play();
  void pause() => _handler.pause();
  void seek(Duration pos) => _handler.seek(pos);
  void next() => _handler.skipToNext();
  void previous() => _handler.skipToPrevious();
  void skipTo(int index) => _handler.skipToQueueItem(index);

  void toggleShuffle() => _handler.setShuffleModeEnabled(!state.shuffle);

  /// Cycles off → all → one → off, same order as the web client.
  void toggleRepeat() {
    const order = [LoopMode.off, LoopMode.all, LoopMode.one];
    final next = order[(order.indexOf(state.repeatMode) + 1) % order.length];
    _handler.setLoopMode(next);
  }
}

final playerProvider =
    StateNotifierProvider<PlayerNotifier, PlayerState>(
  (ref) => PlayerNotifier(ref.read(audioHandlerProvider)),
);

// ── Library data providers ─────────────────────────────────────────────────────

final albumListProvider =
    FutureProvider.autoDispose.family<List<Album>, String>((ref, type) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getAlbumList(type);
});

final artistsProvider =
    FutureProvider.autoDispose<List<ArtistIndex>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getArtists();
});

final artistDetailProvider =
    FutureProvider.autoDispose.family<({Artist artist, List<Album> albums}), String>(
        (ref, id) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getArtistDetail(id);
});

/// All songs across every album by this artist, flattened — backs the
/// artist detail screen's "Songs" tab.
final artistSongsProvider =
    FutureProvider.autoDispose.family<List<Song>, String>((ref, artistId) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  final detail = await client.getArtistDetail(artistId);
  final results = await Future.wait(detail.albums.map((a) => client.getAlbum(a.id)));
  return results.expand((r) => r.songs).toList();
});

final albumDetailProvider =
    FutureProvider.autoDispose.family<({Album album, List<Song> songs}), String>(
        (ref, id) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getAlbum(id);
});

final searchProvider =
    FutureProvider.autoDispose.family<SearchResult, String>((ref, query) async {
  if (query.isEmpty) return const SearchResult(artists: [], albums: [], songs: []);
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.search(query);
});

final starredProvider = FutureProvider.autoDispose<
    ({List<Artist> artists, List<Album> albums, List<Song> songs})>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getStarred();
});

final playlistsProvider =
    FutureProvider.autoDispose<List<Playlist>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getPlaylists();
});

final playlistDetailProvider =
    FutureProvider.autoDispose.family<Playlist, String>((ref, id) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getPlaylist(id);
});

/// When each track was added to this playlist — drives the "date added"
/// column and the "sort by date added" view on the playlist detail screen.
final playlistTrackDatesProvider =
    FutureProvider.autoDispose.family<Map<String, DateTime>, String>((ref, id) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getPlaylistTrackDates(id);
});

final downloadsProvider =
    FutureProvider.autoDispose<List<DownloadedTrack>>((ref) async {
  return ref.read(downloadServiceProvider).getDownloads();
});

/// Per-user pin/recency state for the unified Library list (see
/// `screens/library_screen.dart` and `utils/library_sidebar_order.dart`).
final librarySidebarStateProvider =
    FutureProvider.autoDispose<List<LibrarySidebarItem>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getLibrarySidebarState();
});

// ── Home page ─────────────────────────────────────────────────────────────────

final lastPlayedProvider = FutureProvider.autoDispose<Song?>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getLastPlayed();
});

final mostPlayedProvider = FutureProvider.autoDispose<List<Song>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getMostPlayed();
});

final recentlyPlayedProvider = FutureProvider.autoDispose<List<Song>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getRecentlyPlayed();
});

final rediscoverProvider = FutureProvider.autoDispose<List<Song>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getRediscover();
});

// ── Wrapped & Discover ───────────────────────────────────────────────────────

final wrappedProvider =
    FutureProvider.autoDispose.family<WrappedStats, int>((ref, year) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getWrapped(year: year);
});

/// 'similar' or 'discover'.
final recommendationsProvider =
    FutureProvider.autoDispose.family<RecommendationsResult, String>((ref, type) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getRecommendations(type);
});

// ── Account & admin ─────────────────────────────────────────────────────────

final meProvider = FutureProvider.autoDispose<MeInfo>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getMe();
});

final adminUsersProvider = FutureProvider.autoDispose<List<AdminUser>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.adminGetUsers();
});

final adminLibrariesProvider = FutureProvider.autoDispose<List<Library>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.adminGetLibraries();
});

final adminSettingsProvider = FutureProvider.autoDispose<Map<String, String>>((ref) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.adminGetSettings();
});
