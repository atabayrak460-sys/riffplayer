import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import '../widgets/song_tile.dart';

const _pageSize = 200;

class AllSongsScreen extends ConsumerStatefulWidget {
  const AllSongsScreen({super.key});

  @override
  ConsumerState<AllSongsScreen> createState() => _AllSongsScreenState();
}

class _AllSongsScreenState extends ConsumerState<AllSongsScreen> {
  final List<Song> _songs = [];
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final client = ref.read(apiClientProvider);
    if (client == null) return;
    try {
      final page = await client.getAllSongs(0, _pageSize);
      setState(() {
        _songs
          ..clear()
          ..addAll(page);
        _hasMore = page.length == _pageSize;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final client = ref.read(apiClientProvider);
    if (client == null || _loadingMore || !_hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final page = await client.getAllSongs(_songs.length, _pageSize);
      setState(() {
        _songs.addAll(page);
        _hasMore = page.length == _pageSize;
        _loadingMore = false;
      });
    } catch (_) {
      setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('All Songs')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Text('Error: $_error', style: const TextStyle(color: Colors.red)),
                )
              : _songs.isEmpty
                  ? const Center(
                      child: Text('No songs found.',
                          style: TextStyle(color: Color(0xFF71717A))),
                    )
                  : ListView.builder(
                      itemCount: _songs.length + 1,
                      itemBuilder: (_, i) {
                        if (i == _songs.length) {
                          if (!_hasMore) return const SizedBox(height: 24);
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 20),
                            child: Center(
                              child: _loadingMore
                                  ? const CircularProgressIndicator()
                                  : TextButton(
                                      onPressed: _loadMore,
                                      child: const Text('Load more'),
                                    ),
                            ),
                          );
                        }
                        final song = _songs[i];
                        return SongTile(
                          song: song,
                          queue: _songs,
                          index: i,
                          showAlbum: true,
                          addedAt: song.created,
                        );
                      },
                    ),
    );
  }
}
