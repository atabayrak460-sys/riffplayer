import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import '../api/subsonic.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import '../utils/snackbar.dart';
import '../widgets/cover_art.dart';
import '../widgets/lyrics_view.dart';
import '../widgets/nowplaying/album_tracks_section.dart';
import '../widgets/nowplaying/artist_tracks_section.dart';
import '../widgets/device_picker.dart';
import '../widgets/nowplaying/up_next_section.dart';

String _fmt(Duration d) {
  final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$m:$s';
}

enum _SwipeAxis { none, horizontal, vertical }

class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({super.key});

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends ConsumerState<PlayerScreen>
    with SingleTickerProviderStateMixin {
  // Small movement before a direction is picked — avoids a barely-there
  // finger wobble locking the gesture to the wrong axis.
  static const _axisLockSlop = 8.0;
  // Kept low so a normal swipe-and-release reads as an instant skip/dismiss,
  // not a drag you have to fully commit to.
  static const _horizontalDistanceThreshold = 50.0;
  static const _horizontalVelocityThreshold = 250.0;
  static const _verticalDistanceThreshold = 70.0;
  static const _verticalVelocityThreshold = 300.0;

  late final AnimationController _snapBackController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 200),
  )..addListener(() => setState(() {}));
  Animation<Offset> _snapBack = const AlwaysStoppedAnimation(Offset.zero);

  _SwipeAxis _axis = _SwipeAxis.none;
  bool _dragging = false;
  Offset _dragOffset = Offset.zero;

  Offset get _offset => _dragging ? _dragOffset : _snapBack.value;

  @override
  void dispose() {
    _snapBackController.dispose();
    super.dispose();
  }

  void _onPanStart(DragStartDetails details) {
    _snapBackController.stop();
    setState(() {
      _dragging = true;
      _axis = _SwipeAxis.none;
      _dragOffset = Offset.zero;
    });
  }

  void _onPanUpdate(DragUpdateDetails details) {
    setState(() {
      final next = _dragOffset + details.delta;
      if (_axis == _SwipeAxis.none &&
          (next.dx.abs() > _axisLockSlop || next.dy.abs() > _axisLockSlop)) {
        _axis = next.dx.abs() >= next.dy.abs()
            ? _SwipeAxis.horizontal
            : _SwipeAxis.vertical;
      }
      _dragOffset = switch (_axis) {
        _SwipeAxis.horizontal => Offset(next.dx, 0),
        // Downward only — an upward drag on the art shouldn't do anything.
        _SwipeAxis.vertical => Offset(0, next.dy.clamp(0, double.infinity)),
        _SwipeAxis.none => next,
      };
    });
  }

  void _onPanEnd(DragEndDetails details) {
    final axis = _axis;
    final offset = _dragOffset;
    final velocity = details.velocity.pixelsPerSecond;
    setState(() => _dragging = false);

    if (axis == _SwipeAxis.horizontal) {
      final notifier = ref.read(playerProvider.notifier);
      if (offset.dx <= -_horizontalDistanceThreshold ||
          velocity.dx <= -_horizontalVelocityThreshold) {
        notifier.next();
      } else if (offset.dx >= _horizontalDistanceThreshold ||
          velocity.dx >= _horizontalVelocityThreshold) {
        notifier.previous();
      }
      _animateBackFrom(offset);
      return;
    }

    if (axis == _SwipeAxis.vertical) {
      if (offset.dy >= _verticalDistanceThreshold ||
          velocity.dy >= _verticalVelocityThreshold) {
        context.pop();
        return; // screen is on its way out — no snap-back needed
      }
      _animateBackFrom(offset);
      return;
    }

    _animateBackFrom(offset);
  }

  void _animateBackFrom(Offset start) {
    _axis = _SwipeAxis.none;
    _snapBack = Tween<Offset>(begin: start, end: Offset.zero).animate(
      CurvedAnimation(parent: _snapBackController, curve: Curves.easeOut),
    );
    _snapBackController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    // Scoped to just the fields this screen shows — excludes queue/
    // queueIndex, so e.g. adding a song to the queue while this screen is
    // open doesn't trigger a rebuild here.
    final (
      song,
      position,
      duration,
      shuffle,
      playing,
      repeatMode,
      queue,
      currentIndex
    ) = ref.watch(playerProvider.select(
      (s) => (
        s.currentSong,
        s.position,
        s.duration,
        s.shuffle,
        s.playing,
        s.repeatMode,
        s.queue,
        s.currentIndex,
      ),
    ));
    final client = ref.read(apiClientProvider);
    final showLyrics = ref.watch(showLyricsProvider);
    final horizontalOffset = Offset(_offset.dx, 0);
    final dismissProgress =
        (_offset.dy / _verticalDistanceThreshold).clamp(0.0, 1.0);
    final nextSong = song != null && currentIndex + 1 < queue.length
        ? queue[currentIndex + 1]
        : null;
    final prevSong =
        song != null && currentIndex > 0 ? queue[currentIndex - 1] : null;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.keyboard_arrow_down),
          onPressed: () => context.pop(),
        ),
        title: const Text('Now Playing',
            style: TextStyle(fontSize: 14, color: Color(0xFF71717A))),
        centerTitle: true,
        actions: [
          const DevicePickerButton(),
          IconButton(
            icon: const Icon(Icons.queue_music),
            tooltip: 'Queue',
            onPressed: () => context.push('/queue'),
          ),
        ],
      ),
      body: song == null
          ? const Center(
              child: Text('Nothing playing',
                  style: TextStyle(color: Color(0xFF71717A))))
          : SafeArea(
              child: Transform.translate(
                offset: Offset(0, _offset.dy),
                child: Opacity(
                  // Fades out as the dismiss drag progresses — snaps back to
                  // fully opaque along with the rest of the gesture if it
                  // doesn't cross the threshold.
                  opacity: 1 - dismissProgress * 0.4,
                  child: SingleChildScrollView(
                    physics: _dragging && _axis == _SwipeAxis.vertical
                        ? const NeverScrollableScrollPhysics()
                        : const ClampingScrollPhysics(),
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 28),
                          child: Column(
                            children: [
                              const SizedBox(height: 16),
                              // Cover art / lyrics — the only part of the screen that
                              // responds to the swipe gestures below: horizontal
                              // drags skip tracks, a downward drag dismisses the
                              // screen. GestureDetector uses onPan* (not the
                              // direction-specific callbacks) so a single recognizer
                              // can pick whichever axis the drag actually commits to.
                              Builder(builder: (context) {
                                final artSize =
                                    MediaQuery.of(context).size.width - 56;
                                return GestureDetector(
                                  onPanStart: _onPanStart,
                                  onPanUpdate: _onPanUpdate,
                                  onPanEnd: _onPanEnd,
                                  child: showLyrics
                                      ? Transform.translate(
                                          offset: horizontalOffset,
                                          child: LyricsView(
                                            songId: song.id,
                                            position: position,
                                            size: artSize,
                                          ),
                                        )
                                      : ClipRect(
                                          child: SizedBox(
                                            width: artSize,
                                            height: artSize,
                                            child: Stack(
                                              children: [
                                                if (horizontalOffset.dx < 0 &&
                                                    nextSong != null)
                                                  Positioned.fill(
                                                    child: Transform.translate(
                                                      offset: Offset(
                                                          horizontalOffset.dx +
                                                              artSize,
                                                          0),
                                                      child: _PlayerCoverArt(
                                                          song: nextSong,
                                                          client: client,
                                                          size: artSize),
                                                    ),
                                                  ),
                                                if (horizontalOffset.dx > 0 &&
                                                    prevSong != null)
                                                  Positioned.fill(
                                                    child: Transform.translate(
                                                      offset: Offset(
                                                          horizontalOffset.dx -
                                                              artSize,
                                                          0),
                                                      child: _PlayerCoverArt(
                                                          song: prevSong,
                                                          client: client,
                                                          size: artSize),
                                                    ),
                                                  ),
                                                Positioned.fill(
                                                  child: Transform.translate(
                                                    offset: horizontalOffset,
                                                    child: _PlayerCoverArt(
                                                        song: song,
                                                        client: client,
                                                        size: artSize),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                );
                              }),
                              const SizedBox(height: 32),
                              // Song info
                              Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          song.title,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 20,
                                            fontWeight: FontWeight.bold,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        const SizedBox(height: 4),
                                        GestureDetector(
                                          // `.go()`, not `.push()`: the artist page may
                                          // already be underneath this screen in the
                                          // stack (e.g. tapped a song from that same
                                          // artist's page to get here) — pushing a
                                          // second copy of the same route crashes with
                                          // a duplicate-GlobalKey assertion. `.go()`
                                          // rebuilds the stack fresh instead of
                                          // appending, so it can never collide.
                                          onTap: () => context
                                              .go('/artists/${song.artistId}'),
                                          child: Text(
                                            song.artist,
                                            style: TextStyle(
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .primary,
                                              fontSize: 15,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        const RemoteLabel(),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: Icon(
                                      showLyrics
                                          ? Icons.lyrics
                                          : Icons.lyrics_outlined,
                                      color: showLyrics
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primary
                                          : const Color(0xFF71717A),
                                    ),
                                    onPressed: () => ref
                                        .read(showLyricsProvider.notifier)
                                        .state = !showLyrics,
                                  ),
                                  IconButton(
                                    icon: Icon(
                                      song.isStarred
                                          ? Icons.favorite
                                          : Icons.favorite_border,
                                      color: song.isStarred
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primary
                                          : const Color(0xFF71717A),
                                    ),
                                    onPressed: () {
                                      final newStarred =
                                          song.isStarred ? null : 'true';
                                      final future = song.isStarred
                                          ? client?.unstar(id: song.id)
                                          : client?.star(id: song.id);
                                      future?.then((_) {
                                        ref
                                            .read(playerProvider.notifier)
                                            .setStarredInQueue(
                                                song.id, newStarred);
                                        ref.invalidate(starredProvider);
                                      }).catchError((_) {
                                        final msg = song.isStarred
                                            ? 'Failed to unstar'
                                            : 'Failed to star';
                                        // ignore: use_build_context_synchronously
                                        showFailureSnackBar(context, msg);
                                      }).ignore();
                                    },
                                  ),
                                ],
                              ),
                              const SizedBox(height: 24),
                              // Seek bar
                              Slider(
                                value: duration.inMilliseconds > 0
                                    ? (position.inMilliseconds /
                                            duration.inMilliseconds)
                                        .clamp(0.0, 1.0)
                                    : 0.0,
                                onChanged: (v) {
                                  final target = Duration(
                                    milliseconds:
                                        (v * duration.inMilliseconds).round(),
                                  );
                                  ref
                                      .read(playerProvider.notifier)
                                      .seek(target);
                                },
                              ),
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 4),
                                child: Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(_fmt(position),
                                        style: const TextStyle(
                                            color: Color(0xFF71717A),
                                            fontSize: 12)),
                                    Text(_fmt(duration),
                                        style: const TextStyle(
                                            color: Color(0xFF71717A),
                                            fontSize: 12)),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              // Controls
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceEvenly,
                                children: [
                                  IconButton(
                                    iconSize: 22,
                                    icon: Icon(
                                      Icons.shuffle,
                                      color: shuffle
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primary
                                          : const Color(0xFF71717A),
                                    ),
                                    onPressed: () => ref
                                        .read(playerProvider.notifier)
                                        .toggleShuffle(),
                                  ),
                                  IconButton(
                                    iconSize: 36,
                                    icon: const Icon(Icons.skip_previous,
                                        color: Colors.white),
                                    onPressed: () => ref
                                        .read(playerProvider.notifier)
                                        .previous(),
                                  ),
                                  Container(
                                    width: 64,
                                    height: 64,
                                    decoration: BoxDecoration(
                                      color:
                                          Theme.of(context).colorScheme.primary,
                                      shape: BoxShape.circle,
                                    ),
                                    child: IconButton(
                                      iconSize: 34,
                                      icon: Icon(
                                        playing
                                            ? Icons.pause
                                            : Icons.play_arrow,
                                        color: Colors.white,
                                      ),
                                      onPressed: () {
                                        final notifier =
                                            ref.read(playerProvider.notifier);
                                        playing
                                            ? notifier.pause()
                                            : notifier.play();
                                      },
                                    ),
                                  ),
                                  IconButton(
                                    iconSize: 36,
                                    icon: const Icon(Icons.skip_next,
                                        color: Colors.white),
                                    onPressed: () => ref
                                        .read(playerProvider.notifier)
                                        .next(),
                                  ),
                                  IconButton(
                                    iconSize: 22,
                                    icon: Icon(
                                      repeatMode == LoopMode.one
                                          ? Icons.repeat_one
                                          : Icons.repeat,
                                      color: repeatMode != LoopMode.off
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primary
                                          : const Color(0xFF71717A),
                                    ),
                                    onPressed: () => ref
                                        .read(playerProvider.notifier)
                                        .toggleRepeat(),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        const UpNextSection(),
                        AlbumTracksSection(song: song),
                        ArtistTracksSection(song: song),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

/// Full-size cover art for a single track — used for the currently playing
/// track and for the next/previous track peeking in from the edge while the
/// hero art is being dragged.
class _PlayerCoverArt extends StatelessWidget {
  final Song song;
  final SubsonicClient? client;
  final double size;

  const _PlayerCoverArt({
    required this.song,
    required this.client,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    return CoverArt(
      // Full-screen hero image — the most prominent artwork in the app
      // deserves a size closer to what a high-DPI display actually needs,
      // not the ~44px-thumbnail-derived default.
      url: song.coverArt != null
          ? client?.coverArtUrl(song.coverArt!, size: 800)
          : null,
      size: size,
      borderRadius: BorderRadius.circular(12),
    );
  }
}
