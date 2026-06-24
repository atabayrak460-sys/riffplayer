import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import 'cover_art.dart';

String _fmtDuration(int? seconds) {
  if (seconds == null) return '';
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

class SongTile extends ConsumerWidget {
  final Song song;
  final List<Song>? queue;
  final int? index;
  final bool showAlbum;
  final bool showNumber;

  const SongTile({
    super.key,
    required this.song,
    this.queue,
    this.index,
    this.showAlbum = false,
    this.showNumber = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playerState = ref.watch(playerProvider);
    final isCurrent = playerState.currentSong?.id == song.id;

    return ListTile(
      onTap: () => _play(ref),
      leading: showAlbum
          ? CoverArt(
              url: _coverUrl(ref, song.coverArt),
              size: 44,
            )
          : showNumber
              ? SizedBox(
                  width: 32,
                  child: Text(
                    (index != null) ? '${index! + 1}' : '',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: isCurrent
                          ? Theme.of(context).colorScheme.primary
                          : const Color(0xFF71717A),
                      fontSize: 14,
                    ),
                  ),
                )
              : null,
      title: Text(
        song.title,
        style: TextStyle(
          color: isCurrent
              ? Theme.of(context).colorScheme.primary
              : Colors.white,
          fontWeight: isCurrent ? FontWeight.w600 : FontWeight.normal,
          fontSize: 14,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        showAlbum ? '${song.artist} · ${song.album}' : song.artist,
        style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _fmtDuration(song.duration),
            style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
          ),
          const SizedBox(width: 4),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Color(0xFF71717A), size: 18),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'queue', child: Text('Add to queue')),
              const PopupMenuItem(value: 'download', child: Text('Download')),
              PopupMenuItem(
                value: 'star',
                child: Text(song.isStarred ? 'Unstar' : 'Star'),
              ),
            ],
            onSelected: (v) => _onMenu(v, ref),
          ),
        ],
      ),
    );
  }

  String? _coverUrl(WidgetRef ref, String? coverArt) {
    final client = ref.read(apiClientProvider);
    return coverArt != null ? client?.coverArtUrl(coverArt, size: 100) : null;
  }

  void _play(WidgetRef ref) {
    final client = ref.read(apiClientProvider);
    final downloads = ref.read(downloadServiceProvider);
    if (client == null) return;
    ref.read(playerProvider.notifier).playSong(
          song,
          client,
          downloads,
          queue: queue,
          queueIndex: queue?.indexOf(song),
        );
  }

  void _onMenu(String action, WidgetRef ref) {
    final client = ref.read(apiClientProvider);
    if (client == null) return;
    switch (action) {
      case 'queue':
        final downloads = ref.read(downloadServiceProvider);
        ref.read(playerProvider.notifier).addToQueue(song, client, downloads);
      case 'download':
        final downloads = ref.read(downloadServiceProvider);
        downloads.download(song, client).ignore();
      case 'star':
        if (song.isStarred) {
          client.unstar(id: song.id).ignore();
        } else {
          client.star(id: song.id).ignore();
        }
    }
  }
}
