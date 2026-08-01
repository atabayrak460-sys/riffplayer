import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import 'cover_art.dart';

class HomeTrackCard extends ConsumerWidget {
  final Song song;
  final List<Song> queue;

  const HomeTrackCard({super.key, required this.song, required this.queue});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isCurrent = ref.watch(playerProvider).currentSong?.id == song.id;
    final client = ref.read(apiClientProvider);
    final coverUrl =
        song.coverArt != null ? client?.coverArtUrl(song.coverArt!, size: 300) : null;

    return GestureDetector(
      onTap: () {
        final downloads = ref.read(downloadServiceProvider);
        if (client == null) return;
        ref.read(playerProvider.notifier).playSong(song, client, downloads, queue: queue);
      },
      child: SizedBox(
        width: 140,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: CoverArt(
                url: coverUrl,
                size: null,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              song.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: isCurrent ? Theme.of(context).colorScheme.primary : Colors.white,
                fontWeight: FontWeight.w500,
                fontSize: 13,
              ),
            ),
            Text(
              song.artist,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
