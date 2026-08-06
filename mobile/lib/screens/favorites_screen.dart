import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../utils/snackbar.dart';
import '../widgets/song_tile.dart';
import '../widgets/stock_covers.dart' as stock;

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final starredAsync = ref.watch(starredProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Favourites')),
      body: starredAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (data) {
          if (data.artists.isEmpty && data.albums.isEmpty && data.songs.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'Nothing starred yet.\nTap ☆ on a song, album or artist.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF71717A)),
                ),
              ),
            );
          }
          final total = data.songs.length + data.albums.length + data.artists.length;
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Row(
                  children: [
                    const stock.FavouritesCover(
                      size: 56,
                      borderRadius: BorderRadius.all(Radius.circular(10)),
                    ),
                    const SizedBox(width: 14),
                    Text(
                      '$total starred item${total == 1 ? '' : 's'}',
                      style: const TextStyle(color: Color(0xFF71717A), fontSize: 13),
                    ),
                  ],
                ),
              ),
              if (data.songs.isNotEmpty) ...[
                const _SectionHeader('Songs'),
                ...data.songs.map((s) => SongTile(
                      song: s,
                      queue: data.songs,
                      showAlbum: true,
                    )),
              ],
              if (data.albums.isNotEmpty) ...[
                const _SectionHeader('Albums'),
                ...data.albums.map((a) => ListTile(
                      leading: const Icon(Icons.album, color: Color(0xFF71717A)),
                      title: Text(a.name,
                          style: const TextStyle(color: Colors.white)),
                      subtitle: Text(a.artist,
                          style: const TextStyle(
                              color: Color(0xFF71717A), fontSize: 12)),
                      trailing: IconButton(
                        icon: const Icon(Icons.star, color: Color(0xFFA78BFA)),
                        onPressed: () => ref
                            .read(apiClientProvider)
                            ?.unstar(albumId: a.id)
                            .then((_) => ref.invalidate(starredProvider))
                            // ignore: use_build_context_synchronously
                            .catchError((_) => showFailureSnackBar(context, 'Failed to unstar'))
                            .ignore(),
                      ),
                    )),
              ],
              if (data.artists.isNotEmpty) ...[
                const _SectionHeader('Artists'),
                ...data.artists.map((a) => ListTile(
                      leading: const Icon(Icons.person, color: Color(0xFF71717A)),
                      title: Text(a.name,
                          style: const TextStyle(color: Colors.white)),
                    )),
              ],
              const SizedBox(height: 80),
            ],
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 6),
        child: Text(
          title.toUpperCase(),
          style: const TextStyle(
            color: Color(0xFF71717A),
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.2,
          ),
        ),
      );
}
