import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import '../api/types.dart';
import '../api/subsonic.dart';
import '../services/download_service.dart';

/// Converts a [Song] into a [MediaItem] for lock-screen / notification display.
MediaItem songToMediaItem(Song song, SubsonicClient client) => MediaItem(
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration != null ? Duration(seconds: song.duration!) : null,
      artUri: song.coverArt != null
          ? Uri.parse(client.coverArtUrl(song.coverArt!, size: 300))
          : null,
      extras: {
        'replayGainTrackGain': song.replayGainTrackGain,
        'songId': song.id,
      },
    );

/// Builds an [AudioSource] for a song, using a local file if downloaded.
Future<AudioSource> buildAudioSource(
  Song song,
  SubsonicClient client,
  DownloadService downloads,
) async {
  final localPath = await downloads.localPath(song.id);
  final uri =
      localPath != null ? Uri.file(localPath) : Uri.parse(client.streamUrl(song.id));

  return AudioSource.uri(uri, tag: songToMediaItem(song, client));
}

class CadenceAudioHandler extends BaseAudioHandler
    with QueueHandler, SeekHandler {
  final AudioPlayer _player = AudioPlayer();
  ConcatenatingAudioSource? _queue;

  CadenceAudioHandler() {
    // Forward playback state to audio_service
    _player.playbackEventStream.map(_transformEvent).pipe(playbackState);

    // Forward current media item to audio_service
    _player.sequenceStateStream.listen((state) {
      if (state == null) return;
      final tag = state.currentSource?.tag;
      if (tag is MediaItem) mediaItem.add(tag);
    });

    // Auto-advance handled by just_audio; expose queue to audio_service
    _player.sequenceStateStream.listen((state) {
      if (state == null) return;
      queue.add(
        state.sequence
            .map((s) => s.tag)
            .whereType<MediaItem>()
            .toList(),
      );
    });
  }

  // ── Queue management ────────────────────────────────────────────────────────

  /// Replace the queue and start playing from [initialIndex].
  Future<void> playQueue(List<AudioSource> sources, int initialIndex) async {
    _queue = ConcatenatingAudioSource(children: sources);
    await _player.setAudioSource(
      _queue!,
      initialIndex: initialIndex,
      initialPosition: Duration.zero,
    );
    await _player.play();
  }

  /// Append a single track to the end of the current queue.
  Future<void> appendToQueue(AudioSource source) async {
    if (_queue == null) {
      await playQueue([source], 0);
      return;
    }
    await _queue!.add(source);
  }

  Future<void> removeQueueItemAt(int index) async {
    await _queue?.removeAt(index);
  }

  Future<void> moveQueueItem(int oldIndex, int newIndex) async {
    await _queue?.move(oldIndex, newIndex);
  }

  // ── AudioHandler overrides ──────────────────────────────────────────────────

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> skipToNext() => _player.seekToNext();

  @override
  Future<void> skipToPrevious() {
    // If more than 3 seconds in, restart; otherwise go to previous
    if (_player.position > const Duration(seconds: 3)) {
      return _player.seek(Duration.zero);
    }
    return _player.seekToPrevious();
  }

  @override
  Future<void> skipToQueueItem(int index) =>
      _player.seek(Duration.zero, index: index);

  @override
  Future<void> stop() async {
    await _player.stop();
    await super.stop();
  }

  @override
  Future<void> onTaskRemoved() => stop();

  // ── State transform ─────────────────────────────────────────────────────────

  PlaybackState _transformEvent(PlaybackEvent event) => PlaybackState(
        controls: [
          MediaControl.skipToPrevious,
          if (_player.playing) MediaControl.pause else MediaControl.play,
          MediaControl.skipToNext,
        ],
        systemActions: const {
          MediaAction.seek,
          MediaAction.seekForward,
          MediaAction.seekBackward,
          MediaAction.skipToNext,
          MediaAction.skipToPrevious,
        },
        androidCompactActionIndices: const [0, 1, 2],
        processingState: const {
          ProcessingState.idle: AudioProcessingState.idle,
          ProcessingState.loading: AudioProcessingState.loading,
          ProcessingState.buffering: AudioProcessingState.buffering,
          ProcessingState.ready: AudioProcessingState.ready,
          ProcessingState.completed: AudioProcessingState.completed,
        }[_player.processingState]!,
        playing: _player.playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: event.currentIndex,
      );

  // ── Expose player streams ───────────────────────────────────────────────────

  Stream<Duration> get positionStream => _player.positionStream;
  Stream<Duration?> get durationStream => _player.durationStream;
  Stream<bool> get playingStream => _player.playingStream;
  Stream<int?> get currentIndexStream => _player.currentIndexStream;
  bool get playing => _player.playing;
  Duration get position => _player.position;
  Duration? get duration => _player.duration;
}
