import 'dart:async';
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

  // "Now playing" scrobbles fire immediately in playSong(); this tracks the
  // one-time "submission" scrobble (counts as a real play) sent once a track
  // crosses 50% played or 30s, whichever comes first — same rule as the web
  // client, so play counts / Wrapped / Most Played agree across platforms.
  SubsonicClient? _scrobbleClient;
  String? _scrobbledSongId;
  String? _nowPlayingSongId;

  // How many songs "Add to queue" has inserted directly after the current
  // one, in this run — the next addition goes after all of them, so
  // queueing A then B plays A before B instead of each jumping to right
  // after current (which would play B before A). Reset to 0 whenever the
  // current track changes for any reason, since a new "next block" starts
  // fresh relative to whatever's now playing.
  int _queuedCount = 0;

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
      _queuedCount = 0;
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
    final resolvedIndex = idx < 0 ? 0 : idx;

    final sources = await Future.wait(
      songs.map((s) => buildAudioSource(s, client, downloads)),
    );

    // Update the UI-facing state (and fire the scrobble) before waiting on
    // playback to actually start, not after — `_handler.playQueue()` awaits
    // just_audio's `setAudioSource`/`play()`, which on a slow/flaky network
    // response can take an unpredictable while to resolve even though
    // playback is genuinely starting. Gating the mini-player etc. on that
    // full round-trip made it appear to hang with nothing showing as
    // playing even once audio was already audible.
    state = state.copyWith(queue: songs, currentIndex: resolvedIndex);
    _scrobbleClient = client;
    _nowPlayingSongId = song.id;
    client.scrobble(song.id, submission: false).ignore();

    await _handler.playQueue(sources, resolvedIndex);
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

  // Every method below reads `state.queue` and writes the updated list back
  // in the same synchronous expression (never via an intermediate variable
  // held across an `await`). Dart's single-threaded event loop means that
  // synchronous span can't be interrupted, so two calls started in quick
  // succession (e.g. tapping "Add to queue" on two songs back to back) can
  // never read each other's stale pre-await snapshot and clobber one
  // another — a real bug an earlier version of this class had via a
  // separately-tracked `_songs` list.

  /// Inserts [song] right after the current track, or after any songs
  /// already added this way — so adding A then B plays current → A → B.
  Future<void> addToQueue(
    Song song,
    SubsonicClient client,
    DownloadService downloads,
  ) async {
    final source = await buildAudioSource(song, client, downloads);
    if (state.currentIndex < 0) {
      // Nothing playing — this starts it from scratch.
      await _handler.insertAt(0, source);
      state = state.copyWith(queue: [song], currentIndex: 0);
      _scrobbleClient = client;
      _nowPlayingSongId = song.id;
      client.scrobble(song.id, submission: false).ignore();
      return;
    }
    final insertAt = state.currentIndex + 1 + _queuedCount;
    await _handler.insertAt(insertAt, source);
    final current = state.queue;
    state = state.copyWith(
      queue: [...current.sublist(0, insertAt), song, ...current.sublist(insertAt)],
    );
    _queuedCount++;
  }

  Future<void> removeFromQueue(int index) async {
    await _handler.removeQueueItemAt(index);
    final newSongs = [...state.queue]..removeAt(index);
    int newIdx = state.currentIndex;
    if (index < newIdx) newIdx--;
    state = state.copyWith(queue: newSongs, currentIndex: newIdx);
  }

  Future<void> reorderQueue(int from, int to) async {
    await _handler.moveQueueItem(from, to);
    final newSongs = [...state.queue];
    final moved = newSongs.removeAt(from);
    newSongs.insert(to, moved);
    state = state.copyWith(queue: newSongs);
  }

  Future<void> clearQueue() async {
    await _handler.clearQueue();
    _queuedCount = 0;
    state = state.copyWith(queue: [], currentIndex: -1, playing: false);
  }

  /// Jumps playback to [index] within the queue and permanently drops
  /// everything before it — tapping a song further down "Up Next" plays it
  /// and discards the skipped-over tracks, matching Spotify's queue model.
  Future<void> playFromQueueIndex(int index) async {
    await _handler.playFromIndex(index);
    state = state.copyWith(queue: state.queue.sublist(index), currentIndex: 0);
  }

  /// Updates the starred status of every queue entry matching [songId] in
  /// place — the player screen's favorite icon reads `currentSong.isStarred`
  /// straight off the queue, not off `starredProvider`, so star/unstar
  /// there needs to patch this state directly to show up immediately.
  void setStarredInQueue(String songId, String? starred) {
    final newQueue = [
      for (final s in state.queue)
        s.id == songId ? s.withStarred(starred) : s,
    ];
    state = state.copyWith(queue: newQueue);
  }

  void play() => _handler.play();
  void pause() => _handler.pause();
  void seek(Duration pos) => _handler.seek(pos);
  void next() => _handler.skipToNext();
  void previous() => _handler.skipToPrevious();

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
  // Without this the provider tears down and refetches from scratch every
  // time the tab is re-entered (autoDispose's default). Keeping it alive
  // for a few minutes after the last listener unsubscribes means quickly
  // flipping back to a recently-viewed artist's Songs tab reuses the
  // cached result instead of re-fetching every album again.
  final link = ref.keepAlive();
  final timer = Timer(const Duration(minutes: 5), link.close);
  ref.onDispose(timer.cancel);

  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  final detail = await client.getArtistDetail(artistId);

  // Fetched in bounded-concurrency batches rather than firing every
  // album's request at once — a prolific artist (20+ albums) would
  // otherwise burst that many simultaneous network calls on one tab open.
  const batchSize = 5;
  final results = <({Album album, List<Song> songs})>[];
  for (var i = 0; i < detail.albums.length; i += batchSize) {
    final batch = detail.albums.skip(i).take(batchSize);
    results.addAll(await Future.wait(batch.map((a) => client.getAlbum(a.id))));
  }
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

final lyricsProvider =
    FutureProvider.autoDispose.family<Lyrics?, String>((ref, songId) async {
  final client = ref.read(apiClientProvider);
  if (client == null) throw Exception('Not authenticated');
  return client.getLyrics(songId);
});

/// Whether the full-screen player is currently showing the lyrics view
/// instead of the cover art.
final showLyricsProvider = StateProvider.autoDispose<bool>((ref) => false);

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
