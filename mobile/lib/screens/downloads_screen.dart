import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';
import '../api/types.dart';

String _fmtSize(int? bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
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
                    'No downloaded tracks.\nLong-press a song and tap "Download".',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFF71717A)),
                  ),
                ),
              )
            : ListView.builder(
                itemCount: downloads.length,
                itemBuilder: (_, i) => _DownloadTile(
                  track: downloads[i],
                  onDelete: () async {
                    await ref
                        .read(downloadServiceProvider)
                        .deleteDownload(downloads[i].trackId);
                    ref.invalidate(downloadsProvider);
                  },
                ),
              ),
      ),
    );
  }
}

class _DownloadTile extends StatelessWidget {
  final DownloadedTrack track;
  final VoidCallback onDelete;

  const _DownloadTile({required this.track, required this.onDelete});

  @override
  Widget build(BuildContext context) => ListTile(
        leading: const Icon(Icons.music_note, color: Color(0xFF71717A)),
        title: Text(
          track.title,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${track.artist} · ${_fmtSize(track.fileSize)}',
          style: const TextStyle(color: Color(0xFF71717A), fontSize: 12),
        ),
        trailing: IconButton(
          icon: const Icon(Icons.delete_outline, color: Color(0xFF71717A)),
          onPressed: () => showDialog<bool>(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Delete download?'),
              content: Text('Remove "${track.title}" from device?'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel')),
                TextButton(
                    onPressed: () { Navigator.pop(context, true); onDelete(); },
                    child: const Text('Delete',
                        style: TextStyle(color: Colors.red))),
              ],
            ),
          ),
        ),
      );
}
