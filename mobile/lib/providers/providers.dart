import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  const PlayerState({
    this.queue = const [],
    this.currentIndex = -1,
    this.playing = false,
    this.position = Duration.zero,
    this.duration = Duration.zero,
  });

  Song? get currentSong =>
      currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  PlayerState copyWith({
    List<Song>? queue,
    int? currentIndex,
    bool? playing,
    Duration? position,
    Duration? duration,
  }) =>
      PlayerState(
        queue: queue ?? this.queue,
        currentIndex: currentIndex ?? this.currentIndex,
        playing: playing ?? this.playing,
        position: position ?? this.position,
        duration: duration ?? this.duration,
      );
}

class PlayerNotifier extends StateNotifier<PlayerState> {
  final CadenceAudioHandler _handler;
  List<Song> _songs = [];

  PlayerNotifier(this._handler) : super(const PlayerState()) {
    _handler.positionStream.listen((pos) {
      state = state.copyWith(position: pos);
    });
    _handler.durationStream.listen((dur) {
      state = state.copyWith(duration: dur ?? Duration.zero);
    });
    _handler.playingStream.listen((playing) {
      state = state.copyWith(playing: playing);
    });
    _handler.currentIndexStream.listen((idx) {
      state = state.copyWith(currentIndex: idx ?? -1);
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
    client.scrobble(song.id, submission: false).ignore();
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

final downloadsProvider =
    FutureProvider.autoDispose<List<DownloadedTrack>>((ref) async {
  return ref.read(downloadServiceProvider).getDownloads();
});
