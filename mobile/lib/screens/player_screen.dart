import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import '../providers/providers.dart';
import '../widgets/cover_art.dart';
import '../widgets/lyrics_view.dart';

String _fmt(Duration d) {
  final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$m:$s';
}

class PlayerScreen extends ConsumerWidget {
  const PlayerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(playerProvider);
    final song = state.currentSong;
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
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  children: [
                    const Spacer(),
                    // Cover art / lyrics
                    showLyrics
                        ? LyricsView(
                            songId: song.id,
                            position: state.position,
                            size: MediaQuery.of(context).size.width - 56,
                          )
                        : CoverArt(
                            url: song.coverArt != null
                                ? client?.coverArtUrl(song.coverArt!, size: 500)
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
                                onTap: () => context.go('/artists/${song.artistId}'),
                                child: Text(
                                  song.artist,
                                  style: TextStyle(
                                    color: Theme.of(context).colorScheme.primary,
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
                            showLyrics ? Icons.lyrics : Icons.lyrics_outlined,
                            color: showLyrics
                                ? Theme.of(context).colorScheme.primary
                                : const Color(0xFF71717A),
                          ),
                          onPressed: () => ref.read(showLyricsProvider.notifier).state =
                              !showLyrics,
                        ),
                        IconButton(
                          icon: Icon(
                            song.isStarred ? Icons.favorite : Icons.favorite_border,
                            color: song.isStarred
                                ? Theme.of(context).colorScheme.primary
                                : const Color(0xFF71717A),
                          ),
                          onPressed: () {
                            if (song.isStarred) {
                              client?.unstar(id: song.id).ignore();
                            } else {
                              client?.star(id: song.id).ignore();
                            }
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    // Seek bar
                    Slider(
                      value: state.duration.inMilliseconds > 0
                          ? (state.position.inMilliseconds /
                                  state.duration.inMilliseconds)
                              .clamp(0.0, 1.0)
                          : 0.0,
                      onChanged: (v) {
                        final target = Duration(
                          milliseconds:
                              (v * state.duration.inMilliseconds).round(),
                        );
                        ref.read(playerProvider.notifier).seek(target);
                      },
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(_fmt(state.position),
                              style: const TextStyle(
                                  color: Color(0xFF71717A), fontSize: 12)),
                          Text(_fmt(state.duration),
                              style: const TextStyle(
                                  color: Color(0xFF71717A), fontSize: 12)),
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
                            color: state.shuffle
                                ? Theme.of(context).colorScheme.primary
                                : const Color(0xFF71717A),
                          ),
                          onPressed: () =>
                              ref.read(playerProvider.notifier).toggleShuffle(),
                        ),
                        IconButton(
                          iconSize: 36,
                          icon: const Icon(Icons.skip_previous,
                              color: Colors.white),
                          onPressed: () =>
                              ref.read(playerProvider.notifier).previous(),
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
                              state.playing ? Icons.pause : Icons.play_arrow,
                              color: Colors.white,
                            ),
                            onPressed: () {
                              final notifier =
                                  ref.read(playerProvider.notifier);
                              state.playing
                                  ? notifier.pause()
                                  : notifier.play();
                            },
                          ),
                        ),
                        IconButton(
                          iconSize: 36,
                          icon: const Icon(Icons.skip_next, color: Colors.white),
                          onPressed: () =>
                              ref.read(playerProvider.notifier).next(),
                        ),
                        IconButton(
                          iconSize: 22,
                          icon: Icon(
                            state.repeatMode == LoopMode.one
                                ? Icons.repeat_one
                                : Icons.repeat,
                            color: state.repeatMode != LoopMode.off
                                ? Theme.of(context).colorScheme.primary
                                : const Color(0xFF71717A),
                          ),
                          onPressed: () =>
                              ref.read(playerProvider.notifier).toggleRepeat(),
                        ),
                      ],
                    ),
                    const Spacer(),
                  ],
                ),
              ),
            ),
    );
  }
}
