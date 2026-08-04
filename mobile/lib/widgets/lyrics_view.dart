import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/providers.dart';

/// Scrollable lyrics list shown in place of the cover art on the full-screen
/// player. Highlights and auto-scrolls to the current line for synced
/// lyrics; renders plain (unhighlighted) text for unsynced ones — same
/// distinction the web client's LyricsPanel makes.
class LyricsView extends ConsumerStatefulWidget {
  final String songId;
  final Duration position;
  final double size;

  const LyricsView({
    super.key,
    required this.songId,
    required this.position,
    required this.size,
  });

  @override
  ConsumerState<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends ConsumerState<LyricsView> {
  static const _lineHeight = 44.0;
  final _scrollController = ScrollController();
  int _lastActiveIndex = -1;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToActive(int index, int lineCount) {
    if (!_scrollController.hasClients) return;
    final viewport = _scrollController.position.viewportDimension;
    final maxScroll = (lineCount * _lineHeight - viewport).clamp(0.0, double.infinity);
    final target =
        (index * _lineHeight - viewport / 2 + _lineHeight / 2).clamp(0.0, maxScroll);
    _scrollController.animateTo(
      target,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final lyricsAsync = ref.watch(lyricsProvider(widget.songId));

    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: lyricsAsync.when(
        loading: () => const Center(
          child: Text('Loading lyrics…', style: TextStyle(color: Color(0xFF71717A))),
        ),
        error: (_, __) => const Center(
          child: Text('Lyrics unavailable.', style: TextStyle(color: Color(0xFF71717A))),
        ),
        data: (lyrics) {
          if (lyrics == null || lyrics.line.isEmpty) {
            return const Center(
              child: Text('No lyrics found for this track.',
                  style: TextStyle(color: Color(0xFF71717A))),
            );
          }

          var activeIndex = -1;
          if (lyrics.synced) {
            final posMs = widget.position.inMilliseconds;
            for (var i = 0; i < lyrics.line.length; i++) {
              if (lyrics.line[i].start <= posMs) {
                activeIndex = i;
              } else {
                break;
              }
            }
          }

          if (activeIndex != _lastActiveIndex && activeIndex >= 0) {
            _lastActiveIndex = activeIndex;
            final target = activeIndex;
            final count = lyrics.line.length;
            WidgetsBinding.instance
                .addPostFrameCallback((_) => _scrollToActive(target, count));
          }

          return ListView.builder(
            controller: _scrollController,
            itemExtent: _lineHeight,
            itemCount: lyrics.line.length,
            itemBuilder: (_, i) {
              final isActive = i == activeIndex;
              final text = lyrics.line[i].value;
              return Center(
                child: Text(
                  text.isEmpty ? ' ' : text,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: isActive ? Colors.white : const Color(0xFF71717A),
                    fontSize: isActive ? 17 : 14,
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.normal,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
