import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import 'add_to_playlist_dialog.dart';
import 'cover_art.dart';
import 'song_info_dialog.dart';

String _fmtDuration(int? seconds) {
  if (seconds == null) return '';
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

final _addedAtFormat = DateFormat.yMMMd();

class SongTile extends ConsumerWidget {
  final Song song;
  final List<Song>? queue;
  final int? index;
  final bool showAlbum;
  final bool showNumber;
  /// Shown as a right-aligned "date added" column when set — pass the
  /// track's own [Song.created] (library index date) in library-wide views
  /// like All Songs, or a playlist's per-track added-at date inside a
  /// playlist view.
  final DateTime? addedAt;
  /// Overrides the default "play this song, replacing the queue with
  /// [queue]" tap behavior — used by the Queue screen to jump to a song
  /// within the existing queue instead of replacing it.
  final VoidCallback? onTap;
  /// When set, adds a "Remove from queue" action to the overflow menu.
  final VoidCallback? onRemove;

  const SongTile({
    super.key,
    required this.song,
    this.queue,
    this.index,
    this.showAlbum = false,
    this.showNumber = false,
    this.addedAt,
    this.onTap,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Scoped to just the current song's id (via .select()) rather than
    // watching the whole PlayerState — otherwise every visible SongTile in
    // a list rebuilds on every position tick during playback (several
    // times a second), not just the one that's actually playing.
    final currentSongId = ref.watch(playerProvider.select((s) => s.currentSong?.id));
    final isCurrent = currentSongId == song.id;

    return ListTile(
      onTap: onTap ?? () => _play(ref),
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
          if (addedAt != null) ...[
            Text(
              _addedAtFormat.format(addedAt!),
              style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
            ),
            const SizedBox(width: 12),
          ],
          Text(
            _fmtDuration(song.duration),
            style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
          ),
          const SizedBox(width: 4),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Color(0xFF71717A), size: 18),
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'queue', child: Text('Add to queue')),
              const PopupMenuItem(value: 'playlist', child: Text('Add to playlist')),
              const PopupMenuItem(value: 'download', child: Text('Download')),
              PopupMenuItem(
                value: 'star',
                child: Text(song.isStarred ? 'Unstar' : 'Star'),
              ),
              const PopupMenuItem(value: 'album', child: Text('Go to album')),
              const PopupMenuItem(value: 'artist', child: Text('Go to artist')),
              const PopupMenuItem(value: 'info', child: Text('Song info')),
              if (onRemove != null)
                const PopupMenuItem(value: 'remove', child: Text('Remove from queue')),
            ],
            onSelected: (v) => _onMenu(v, context, ref),
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

  void _onMenu(String action, BuildContext context, WidgetRef ref) {
    final client = ref.read(apiClientProvider);
    if (client == null) return;
    switch (action) {
      case 'queue':
        final downloads = ref.read(downloadServiceProvider);
        ref.read(playerProvider.notifier).addToQueue(song, client, downloads);
      case 'playlist':
        showDialog(context: context, builder: (_) => AddToPlaylistDialog(songId: song.id));
      case 'download':
        final downloads = ref.read(downloadServiceProvider);
        downloads.download(song, client).ignore();
      case 'star':
        final newStarred = song.isStarred ? null : 'true';
        final future = song.isStarred
            ? client.unstar(id: song.id)
            : client.star(id: song.id);
        future.then((_) {
          ref.read(playerProvider.notifier).setStarredInQueue(song.id, newStarred);
          ref.invalidate(starredProvider);
        }).ignore();
      case 'album':
        // `.go()`, not `.push()`: this menu is reachable from a track's own
        // album/artist page (e.g. an album's own track list), where pushing
        // a duplicate of the page already underneath crashes with a
        // duplicate-GlobalKey assertion.
        context.go('/albums/${song.albumId}');
      case 'artist':
        context.go('/artists/${song.artistId}');
      case 'info':
        showDialog(context: context, builder: (_) => SongInfoDialog(song: song));
      case 'remove':
        onRemove?.call();
    }
  }
}
