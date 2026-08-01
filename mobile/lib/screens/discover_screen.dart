import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../widgets/song_tile.dart';
import '../widgets/stock_covers.dart' as stock;

class DiscoverScreen extends ConsumerWidget {
  const DiscoverScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resultAsync = ref.watch(recommendationsProvider('discover'));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Discover'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(recommendationsProvider('discover')),
          ),
        ],
      ),
      body: resultAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => const Center(
          child: Text('Could not load recommendations.',
              style: TextStyle(color: Color(0xFF71717A))),
        ),
        data: (result) {
          if (result.songs.isEmpty) {
            return const Center(
              child: Text('Nothing to discover yet — keep listening!',
                  style: TextStyle(color: Color(0xFF71717A))),
            );
          }
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    stock.DiscoverCover(size: 56, borderRadius: BorderRadius.circular(10)),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Picked for you',
                              style: TextStyle(
                                  color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          if (result.source != null)
                            Text(
                              result.source == 'ollama'
                                  ? 'Generated with AI, based on your listening history.'
                                  : 'Based on your listening history.',
                              style: const TextStyle(color: Color(0xFF71717A), fontSize: 12.5),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              ...result.songs.map(
                (song) => SongTile(song: song, queue: result.songs, showAlbum: true),
              ),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }
}
