import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../widgets/cover_art.dart';

class ArtistDetailScreen extends ConsumerWidget {
  final String artistId;
  const ArtistDetailScreen({super.key, required this.artistId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(artistDetailProvider(artistId));
    final client = ref.read(apiClientProvider);

    return detailAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (data) {
        final artist = data.artist;
        final albums = data.albums;
        final coverUrl = artist.coverArt != null
            ? client?.coverArtUrl(artist.coverArt!, size: 300)
            : null;

        return Scaffold(
          appBar: AppBar(title: Text(artist.name)),
          body: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CoverArt(
                        url: coverUrl,
                        size: 100,
                        borderRadius: BorderRadius.circular(50),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              artist.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${albums.length} ${albums.length == 1 ? 'album' : 'albums'}',
                              style: const TextStyle(
                                  color: Color(0xFF71717A), fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 0.78,
                ),
                delegate: SliverChildBuilderDelegate(
                  (_, i) {
                    final album = albums[i];
                    final aCoverUrl = album.coverArt != null
                        ? client?.coverArtUrl(album.coverArt!, size: 300)
                        : null;
                    return GestureDetector(
                      onTap: () => context.push('/albums/${album.id}'),
                      child: Padding(
                        padding: EdgeInsets.only(
                          left: i.isEven ? 12 : 0,
                          right: i.isOdd ? 12 : 0,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: aCoverUrl != null
                                    ? Image.network(aCoverUrl, fit: BoxFit.cover,
                                        width: double.infinity)
                                    : Container(color: const Color(0xFF27272A)),
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(album.name,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            if (album.year != null)
                              Text('${album.year}',
                                  style: const TextStyle(
                                      color: Color(0xFF71717A), fontSize: 12)),
                          ],
                        ),
                      ),
                    );
                  },
                  childCount: albums.length,
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),
        );
      },
    );
  }
}
