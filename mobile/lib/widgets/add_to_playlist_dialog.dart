import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';

class AddToPlaylistDialog extends ConsumerWidget {
  final String songId;
  const AddToPlaylistDialog({super.key, required this.songId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playlistsAsync = ref.watch(playlistsProvider);

    return AlertDialog(
      title: const Text('Add to playlist'),
      content: SizedBox(
        width: double.maxFinite,
        child: playlistsAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Text('Error: $e'),
          data: (playlists) => playlists.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('No playlists yet',
                      style: TextStyle(color: Color(0xFF71717A))),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: playlists.length,
                  itemBuilder: (_, i) {
                    final pl = playlists[i];
                    return ListTile(
                      title: Text(pl.name, overflow: TextOverflow.ellipsis),
                      onTap: () async {
                        final client = ref.read(apiClientProvider);
                        if (client == null) return;
                        await client.addSongToPlaylist(pl.id, songId);
                        ref.invalidate(playlistDetailProvider(pl.id));
                        if (context.mounted) Navigator.pop(context);
                      },
                    );
                  },
                ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}
