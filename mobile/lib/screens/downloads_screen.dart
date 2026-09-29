import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import '../providers/providers.dart';
import '../api/types.dart';
import '../widgets/stock_covers.dart' as stock;

String _fmtSize(int? bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}

/// Reconstructs a [Song] from a [DownloadedTrack] so it can be handed to
/// [PlayerNotifier.playSong] — the Downloads screen is offline-first and has
/// no live server data to draw on, so artist/album ids (only needed for
/// "go to artist/album" navigation, which this screen doesn't offer) are
/// left blank rather than guessed. `suffix` comes from the actual
/// downloaded file's extension instead of defaulting to mp3.
Song _songFromDownload(DownloadedTrack t) {
  final ext = p.extension(t.localPath);
  return Song(
    id: t.trackId,
    title: t.title,
    artist: t.artist,
    artistId: '',
    album: t.album,
    albumId: '',
    coverArt: t.coverArtId,
    suffix: ext.isNotEmpty ? ext.substring(1) : 'mp3',
    size: t.fileSize,
  );
}

class DownloadsScreen extends ConsumerWidget {
  const DownloadsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final downloadsAsync = ref.watch(downloadsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Downloads')),
      body: downloadsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (downloads) => downloads.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    'No downloaded tracks.\nTap "⋯" on a song and select "Download".',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF71717A)),
                  ),
                ),
              )
            : Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Row(
                      children: [
                        const stock.DownloadedCover(
                          size: 56,
                          borderRadius: BorderRadius.all(Radius.circular(10)),
                        ),
                        const SizedBox(width: 14),
                        Text(
                          '${downloads.length} track${downloads.length == 1 ? '' : 's'} available offline',
                          style: const TextStyle(
                              color: Color(0xFF71717A), fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: downloads.length,
                      itemBuilder: (_, i) => _DownloadTile(
                        track: downloads[i],
                        onTap: () {
                          final client = ref.read(apiClientProvider);
                          if (client == null) return;
                          final downloadService =
                              ref.read(downloadServiceProvider);
                          final queue =
                              downloads.map(_songFromDownload).toList();
                          ref.read(playerProvider.notifier).playSong(
                                queue[i],
                                client,
                                downloadService,
                                queue: queue,
                                queueIndex: i,
                              );
                        },
                        onDelete: () async {
                          await ref
                              .read(downloadServiceProvider)
                              .deleteDownload(downloads[i].trackId);
                          ref.invalidate(downloadsProvider);
                        },
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _DownloadTile extends ConsumerWidget {
  final DownloadedTrack track;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _DownloadTile({
    required this.track,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Scoped to just the current song's id, same as SongTile — avoids every
    // row rebuilding on every playback position tick.
    final isCurrent = ref.watch(
        playerProvider.select((s) => s.currentSong?.id == track.trackId));

    return ListTile(
      onTap: onTap,
      leading: _DownloadCover(track: track),
      title: Text(
        track.title,
        style: TextStyle(
          color:
              isCurrent ? Theme.of(context).colorScheme.primary : Colors.white,
          fontWeight: isCurrent ? FontWeight.w600 : FontWeight.normal,
          fontSize: 14,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        '${track.artist} · ${_fmtSize(track.fileSize)}',
        style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isCurrent) ...[
            Icon(Icons.graphic_eq,
                color: Theme.of(context).colorScheme.primary, size: 16),
            const SizedBox(width: 8),
          ],
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Color(0xFF71717A)),
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Delete download?'),
                  content: Text('Remove "${track.title}" from device?'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(dialogContext, false),
                        child: const Text('Cancel')),
                    TextButton(
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: const Text('Delete',
                            style: TextStyle(color: Colors.red))),
                  ],
                ),
              );
              if (confirmed == true) onDelete();
            },
          ),
        ],
      ),
    );
  }
}

/// The downloaded track's locally-cached cover art, if it has one — falls
/// back to a generic note icon rather than a network fetch, since this
/// screen is specifically the offline-availability one.
class _DownloadCover extends StatelessWidget {
  final DownloadedTrack track;
  const _DownloadCover({required this.track});

  @override
  Widget build(BuildContext context) {
    final path = track.coverLocalPath;
    if (path == null || !File(path).existsSync()) {
      return const Icon(Icons.music_note, color: Color(0xFF71717A));
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Image.file(File(path), width: 44, height: 44, fit: BoxFit.cover),
    );
  }
}
