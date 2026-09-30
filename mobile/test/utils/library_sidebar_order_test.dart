import 'package:riffplayer_mobile/api/types.dart';
import 'package:riffplayer_mobile/utils/library_sidebar_order.dart';
import 'package:flutter_test/flutter_test.dart';

LibraryRow _row(String key) => LibraryRow(
      itemType: 'playlist',
      itemKey: key,
      to: '/playlists/$key',
      label: key,
    );

LibrarySidebarItem _pinned(String key, DateTime pinnedAt) => LibrarySidebarItem(
      itemType: 'playlist',
      itemKey: key,
      pinnedAt: pinnedAt,
      lastInteractedAt: pinnedAt,
    );

LibrarySidebarItem _interacted(String key, DateTime at) => LibrarySidebarItem(
      itemType: 'playlist',
      itemKey: key,
      lastInteractedAt: at,
    );

void main() {
  group('orderLibraryRows', () {
    test('rows with no matching state stay untouched, in declared order', () {
      final rows = [_row('a'), _row('b'), _row('c')];

      final result = orderLibraryRows(rows, []);

      expect(result.pinned, isEmpty);
      expect(result.dynamic_.map((r) => r.itemKey), ['a', 'b', 'c']);
    });

    test('pinned rows are pulled out of dynamic_ entirely', () {
      final rows = [_row('a'), _row('b')];
      final state = [_pinned('a', DateTime(2024, 1, 1))];

      final result = orderLibraryRows(rows, state);

      expect(result.pinned.map((r) => r.itemKey), ['a']);
      expect(result.dynamic_.map((r) => r.itemKey), ['b']);
    });

    test('multiple pinned rows sort most-recently-pinned first', () {
      final rows = [_row('a'), _row('b'), _row('c')];
      final state = [
        _pinned('a', DateTime(2024, 1, 1)),
        _pinned('b', DateTime(2024, 3, 1)),
        _pinned('c', DateTime(2024, 2, 1)),
      ];

      final result = orderLibraryRows(rows, state);

      expect(result.pinned.map((r) => r.itemKey), ['b', 'c', 'a']);
    });

    test(
        'interacted (non-pinned) rows sort most-recent first, ahead of untouched rows',
        () {
      final rows = [_row('untouched'), _row('old'), _row('recent')];
      final state = [
        _interacted('old', DateTime(2024, 1, 1)),
        _interacted('recent', DateTime(2024, 6, 1)),
      ];

      final result = orderLibraryRows(rows, state);

      expect(result.pinned, isEmpty);
      // Interacted rows first (newest first), then untouched keeps its
      // original declared position at the end.
      expect(result.dynamic_.map((r) => r.itemKey),
          ['recent', 'old', 'untouched']);
    });

    test('pinned, interacted, and untouched rows combine correctly', () {
      final rows = [_row('a'), _row('b'), _row('c'), _row('d')];
      final state = [
        _pinned('c', DateTime(2024, 5, 1)),
        _pinned('a', DateTime(2024, 3, 1)),
        _interacted('b', DateTime(2024, 1, 1)),
        // 'd' has no state entry at all -> untouched.
      ];

      final result = orderLibraryRows(rows, state);

      expect(result.pinned.map((r) => r.itemKey), ['c', 'a']);
      expect(result.dynamic_.map((r) => r.itemKey), ['b', 'd']);
    });
  });
}
