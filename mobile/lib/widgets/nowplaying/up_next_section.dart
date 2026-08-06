import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/providers.dart';
import '../cover_art.dart';

/// Mirrors web's NowPlayingPanel UpNextSection — shows the very next queued
/// track, tap to skip to it. Player screen equivalent of #68.
class UpNextSection extends ConsumerWidget {
  const UpNextSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Scoped to just queue+currentIndex — doesn't need position/duration,
    // so it doesn't rebuild on every playback tick.
    final (queue, currentIndex) = ref.watch(
      playerProvider.select((s) => (s.queue, s.currentIndex)),
    );
    final upNext = currentIndex >= 0 && currentIndex + 1 < queue.length
        ? queue[currentIndex + 1]
        : null;
    if (upNext == null) return const SizedBox.shrink();

    final client = ref.read(apiClientProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: Text(
              'UP NEXT',
              style: TextStyle(
                color: Color(0xFF71717A),
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.1,
              ),
            ),
          ),
          ListTile(
            onTap: () => ref.read(playerProvider.notifier).next(),
            leading: CoverArt(
              url: upNext.coverArt != null
                  ? client?.coverArtUrl(upNext.coverArt!, size: 80)
                  : null,
              size: 40,
              borderRadius: BorderRadius.circular(4),
            ),
            title: Text(
              upNext.title,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              upNext.artist,
              style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: const Icon(Icons.skip_next, color: Color(0xFF71717A)),
          ),
        ],
      ),
    );
  }
}
