import 'package:flutter/material.dart';
import '../api/types.dart';

String _fmtDuration(int? seconds) {
  if (seconds == null) return '—';
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

class SongInfoDialog extends StatelessWidget {
  final Song song;
  const SongInfoDialog({super.key, required this.song});

  @override
  Widget build(BuildContext context) {
    final rows = <(String, String)>[
      ('Title', song.title),
      ('Artist', song.artist),
      ('Album', song.album),
      ('Duration', _fmtDuration(song.duration)),
      ('Format', song.suffix.toUpperCase()),
      if (song.bitRate != null) ('Bitrate', '${song.bitRate} kbps'),
      if (song.playCount != null) ('Play count', '${song.playCount}'),
    ];

    return AlertDialog(
      title: const Text('Song info'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: rows
            .map((r) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(r.$1,
                          style: const TextStyle(color: Color(0xFF71717A), fontSize: 13)),
                      Flexible(
                        child: Text(
                          r.$2,
                          textAlign: TextAlign.right,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ))
            .toList(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
