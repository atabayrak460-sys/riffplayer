import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import '../providers/providers.dart';
import '../utils/snackbar.dart';
import '../widgets/cover_art.dart';
import '../widgets/lyrics_view.dart';
import '../widgets/nowplaying/album_tracks_section.dart';
import '../widgets/nowplaying/artist_tracks_section.dart';
import '../widgets/nowplaying/up_next_section.dart';

String _fmt(Duration d) {
  final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$m:$s';
}

class PlayerScreen extends ConsumerWidget {
  const PlayerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Scoped to just the fields this screen shows — excludes queue/
    // queueIndex, so e.g. adding a song to the queue while this screen is
    // open doesn't trigger a rebuild here.
    final (song, position, duration, shuffle, playing, repeatMode) =
        ref.watch(playerProvider.select(
      (s) => (
        s.currentSong,
        s.position,
        s.duration,
        s.shuffle,
        s.playing,
        s.repeatMode
      ),
    ));
    final client = ref.read(apiClientProvider);
    final showLyrics = ref.watch(showLyricsProvider);

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
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      child: Column(
                        children: [
                          const SizedBox(height: 16),
                          // Cover art / lyrics
                          showLyrics
                              ? LyricsView(
                                  songId: song.id,
                                  position: position,
                                  size: MediaQuery.of(context).size.width - 56,
                                )
                              : CoverArt(
                                  // Full-screen hero image — the most prominent
                                  // artwork in the app deserves a size closer to
                                  // what a high-DPI display actually needs, not
                                  // the ~44px-thumbnail-derived default.
                                  url: song.coverArt != null
                                      ? client?.coverArtUrl(song.coverArt!,
                                          size: 800)
                                      : null,
                                  size: MediaQuery.of(context).size.width - 56,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                          const SizedBox(height: 32),
                          // Song info
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
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
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: Icon(
                                  showLyrics
                                      ? Icons.lyrics
                                      : Icons.lyrics_outlined,
                                  color: showLyrics
                                      ? Theme.of(context).colorScheme.primary
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
                                      ? Theme.of(context).colorScheme.primary
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
                                        .setStarredInQueue(song.id, newStarred);
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
                              ref.read(playerProvider.notifier).seek(target);
                            },
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
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
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              IconButton(
                                iconSize: 22,
                                icon: Icon(
                                  Icons.shuffle,
                                  color: shuffle
                                      ? Theme.of(context).colorScheme.primary
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
                                  color: Theme.of(context).colorScheme.primary,
                                  shape: BoxShape.circle,
                                ),
                                child: IconButton(
                                  iconSize: 34,
                                  icon: Icon(
                                    playing ? Icons.pause : Icons.play_arrow,
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
                                onPressed: () =>
                                    ref.read(playerProvider.notifier).next(),
                              ),
                              IconButton(
                                iconSize: 22,
                                icon: Icon(
                                  repeatMode == LoopMode.one
                                      ? Icons.repeat_one
                                      : Icons.repeat,
                                  color: repeatMode != LoopMode.off
                                      ? Theme.of(context).colorScheme.primary
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
    );
  }
}
