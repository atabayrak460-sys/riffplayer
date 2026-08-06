import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../widgets/cover_art.dart';

class ArtistsScreen extends ConsumerWidget {
  const ArtistsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final indexesAsync = ref.watch(artistsProvider);
    final client = ref.read(apiClientProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Artists')),
      body: indexesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (indexes) => ListView.builder(
          itemCount: indexes.length,
          itemBuilder: (_, i) {
            final index = indexes[i];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Text(
                    index.name,
                    style: const TextStyle(
                      color: Color(0xFF71717A),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                    ),
                  ),
                ),
                ...index.artists.map(
                  (artist) => ListTile(
                    onTap: () => context.push('/artists/${artist.id}'),
                    leading: CoverArt(
                      // 100, not 80 — matches the ~2.3x ratio used for
                      // every other 44px thumbnail elsewhere for consistency
                      // on high-DPI displays.
                      url: artist.coverArt != null
                          ? client?.coverArtUrl(artist.coverArt!, size: 100)
                          : null,
                      size: 44,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    title: Text(
                      artist.name,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                    ),
                    subtitle: Text(
                      '${artist.albumCount} ${artist.albumCount == 1 ? 'album' : 'albums'}',
                      style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right, color: Color(0xFF52525B)),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
