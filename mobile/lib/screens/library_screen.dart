import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/providers.dart';
import '../utils/library_sidebar_order.dart';
import '../widgets/library_list_row.dart';

const _systemItems = <LibraryRow>[
  LibraryRow(itemType: 'system', itemKey: 'favorites', to: '/favorites', label: 'Favourites', stockCoverKey: 'favorites'),
  LibraryRow(itemType: 'system', itemKey: 'recent', to: '/recent', label: 'Recently Played', stockCoverKey: 'recent'),
  LibraryRow(itemType: 'system', itemKey: 'most-played', to: '/most-played', label: 'Most Played', stockCoverKey: 'most-played'),
  LibraryRow(itemType: 'system', itemKey: 'downloaded', to: '/downloads', label: 'Downloaded', stockCoverKey: 'downloaded'),
  LibraryRow(itemType: 'system', itemKey: 'discover', to: '/discover', label: 'Discover', stockCoverKey: 'discover'),
  LibraryRow(itemType: 'system', itemKey: 'wrapped', to: '/wrapped', label: 'Wrapped', stockCoverKey: 'wrapped'),
];

class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playlistsAsync = ref.watch(playlistsProvider);
    final stateAsync = ref.watch(librarySidebarStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New playlist',
            onPressed: () => _createPlaylist(context, ref),
          ),
        ],
      ),
      body: playlistsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (playlists) {
          final rows = <LibraryRow>[
            ..._systemItems,
            ...playlists.map((pl) => LibraryRow(
                  itemType: 'playlist',
                  itemKey: pl.id,
                  to: '/playlists/${pl.id}',
                  label: pl.name,
                  coverArt: pl.coverArt,
                )),
          ];

          // While sidebar state is still loading (or failed to load), fall
          // back to declared order rather than blocking the whole screen.
          final order = orderLibraryRows(rows, stateAsync.valueOrNull ?? const []);

          return ListView(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              if (order.pinned.isNotEmpty) ...[
                ...order.pinned.map((row) => _row(context, ref, row, pinned: true)),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Divider(color: Color(0xFF27272A), height: 1),
                ),
              ],
              ...order.dynamic_.map((row) => _row(context, ref, row, pinned: false)),
              const SizedBox(height: 80),
            ],
          );
        },
      ),
    );
  }

  Widget _row(BuildContext context, WidgetRef ref, LibraryRow row, {required bool pinned}) {
    return LibraryListRow(
      key: ValueKey('${row.itemType}:${row.itemKey}'),
      label: row.label,
      coverArt: row.coverArt,
      stockCoverKey: row.stockCoverKey,
      pinned: pinned,
      onTap: () => _open(context, ref, row),
      onLongPress: () => _showPinMenu(context, ref, row, pinned: pinned),
    );
  }

  void _open(BuildContext context, WidgetRef ref, LibraryRow row) {
    context.push(row.to);
    final client = ref.read(apiClientProvider);
    client?.recordLibraryInteraction(row.itemType, row.itemKey).then(
          (_) => ref.invalidate(librarySidebarStateProvider),
        );
  }

  void _showPinMenu(BuildContext context, WidgetRef ref, LibraryRow row, {required bool pinned}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF18181B),
      builder: (sheetContext) => SafeArea(
        child: ListTile(
          leading: Icon(pinned ? Icons.push_pin_outlined : Icons.push_pin, color: Colors.white),
          title: Text(pinned ? 'Unpin' : 'Pin', style: const TextStyle(color: Colors.white)),
          onTap: () async {
            Navigator.pop(sheetContext);
            final client = ref.read(apiClientProvider);
            if (client == null) return;
            if (pinned) {
              await client.unpinLibraryItem(row.itemType, row.itemKey);
            } else {
              await client.pinLibraryItem(row.itemType, row.itemKey);
            }
            ref.invalidate(librarySidebarStateProvider);
          },
        ),
      ),
    );
  }

  Future<void> _createPlaylist(BuildContext context, WidgetRef ref) async {
    final nameCtrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('New playlist'),
        content: TextField(
          controller: nameCtrl,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Playlist name'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, nameCtrl.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;

    final client = ref.read(apiClientProvider);
    if (client == null) return;
    final playlist = await client.createPlaylist(name);
    ref.invalidate(playlistsProvider);
    if (context.mounted) context.push('/playlists/${playlist.id}');
  }
}
