import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../api/types.dart';

class AlbumsScreen extends ConsumerStatefulWidget {
  const AlbumsScreen({super.key});

  @override
  ConsumerState<AlbumsScreen> createState() => _AlbumsScreenState();
}

class _AlbumsScreenState extends ConsumerState<AlbumsScreen> {
  String _type = 'newest';

  static const _types = [
    ('newest', 'Recently Added'),
    ('recent', 'Recently Played'),
    ('frequent', 'Most Played'),
    ('starred', 'Starred'),
    ('alphabeticalByName', 'A–Z'),
    ('alphabeticalByArtist', 'By Artist'),
    ('random', 'Random'),
  ];

  @override
  Widget build(BuildContext context) {
    final albumsAsync = ref.watch(albumListProvider(_type));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Albums'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort),
            onSelected: (v) => setState(() => _type = v),
            itemBuilder: (_) => _types
                .map((t) => PopupMenuItem(
                      value: t.$1,
                      child: Text(t.$2),
                    ))
                .toList(),
          ),
        ],
      ),
      body: albumsAsync.when(
        loading: () => _skeleton(),
        error: (e, _) => Center(
          child: Text('Error: $e',
              style: const TextStyle(color: Colors.red)),
        ),
        data: (albums) => albums.isEmpty
            ? const Center(
                child: Text(
                  'No albums found.\nAdd a library in the admin panel.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF71717A)),
                ),
              )
            : GridView.builder(
                padding: const EdgeInsets.all(12),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 0.78,
                ),
                itemCount: albums.length,
                itemBuilder: (_, i) => _AlbumCard(album: albums[i]),
              ),
      ),
    );
  }

  Widget _skeleton() => GridView.builder(
        padding: const EdgeInsets.all(12),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 0.78,
        ),
        itemCount: 12,
        itemBuilder: (_, __) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF27272A),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Container(height: 12, width: 100, color: const Color(0xFF27272A)),
            const SizedBox(height: 4),
            Container(height: 10, width: 70, color: const Color(0xFF27272A)),
          ],
        ),
      );
}

class _AlbumCard extends ConsumerWidget {
  final Album album;
  const _AlbumCard({required this.album});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final client = ref.read(apiClientProvider);
    final coverUrl = album.coverArt != null
        ? client?.coverArtUrl(album.coverArt!, size: 300)
        : null;

    return GestureDetector(
      onTap: () => context.push('/albums/${album.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: coverUrl != null
                  ? CachedNetworkImage(
                      imageUrl: coverUrl,
                      fit: BoxFit.cover,
                      width: double.infinity,
                      placeholder: (_, __) => Container(color: const Color(0xFF27272A)),
                      errorWidget: (_, __, ___) => Container(
                        color: const Color(0xFF27272A),
                        child: const Icon(Icons.music_note,
                            color: Color(0xFF52525B), size: 48),
                      ),
                    )
                  : Container(
                      color: const Color(0xFF27272A),
                      child: const Icon(Icons.music_note,
                          color: Color(0xFF52525B), size: 48),
                    ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            album.name,
            style: const TextStyle(
                color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            album.artist,
            style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
