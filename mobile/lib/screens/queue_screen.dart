import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import '../widgets/song_tile.dart';

const _eyebrowStyle = TextStyle(
  color: Color(0xFF71717A),
  fontSize: 11,
  fontWeight: FontWeight.w700,
  letterSpacing: 1.2,
);

class QueueScreen extends ConsumerWidget {
  const QueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(playerProvider);
    final notifier = ref.read(playerProvider.notifier);
    final current = state.currentSong;
    // Everything after the currently playing item — its own reorderable,
    // removable list. The current song itself is shown separately below
    // and isn't part of it, so it can't be dragged or removed from here.
    final upNext = state.queue.length > 1 ? state.queue.sublist(1) : <Song>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Queue'),
        actions: [
          if (state.queue.isNotEmpty)
            TextButton(
              onPressed: notifier.clearQueue,
              child: const Text('Clear'),
            ),
        ],
      ),
      body: state.queue.isEmpty
          ? const Center(
              child: Text('The queue is empty.', style: TextStyle(color: Color(0xFF71717A))),
            )
          : ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                if (current != null) ...[
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, 4),
                    child: Text('NOW PLAYING', style: _eyebrowStyle),
                  ),
                  SongTile(
                    song: current,
                    showAlbum: true,
                    // No-op: the default tap would replace the whole queue
                    // with just this one song, which isn't right here — it's
                    // already playing.
                    onTap: () {},
                  ),
                ],
                if (upNext.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 20, 16, 4),
                    child: Text('NEXT UP', style: _eyebrowStyle),
                  ),
                  ReorderableListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: upNext.length,
                    onReorderItem: (oldIndex, newIndex) =>
                        notifier.reorderQueue(oldIndex + 1, newIndex + 1),
                    itemBuilder: (_, i) {
                      final song = upNext[i];
                      return SongTile(
                        key: ValueKey('${song.id}-${i + 1}'),
                        song: song,
                        showAlbum: true,
                        onTap: () => notifier.playFromQueueIndex(i + 1),
                        onRemove: () => notifier.removeFromQueue(i + 1),
                      );
                    },
                  ),
                ],
              ],
            ),
    );
  }
}
