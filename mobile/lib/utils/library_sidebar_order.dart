import '../api/types.dart';

/// A single entry in the unified Library list — either a fixed system view
/// (Favourites, Recently Played, ...) or a playlist.
class LibraryRow {
  final String itemType; // 'system' | 'playlist'
  final String itemKey;
  final String to; // route to navigate to on tap
  final String label;
  final String? coverArt; // playlist real cover art id, if any
  final String? stockCoverKey; // system-view stock cover selector

  const LibraryRow({
    required this.itemType,
    required this.itemKey,
    required this.to,
    required this.label,
    this.coverArt,
    this.stockCoverKey,
  });
}

class LibraryRowOrder {
  final List<LibraryRow> pinned;
  final List<LibraryRow> dynamic_;

  const LibraryRowOrder({required this.pinned, required this.dynamic_});
}

/// Ports `web/src/lib/librarySidebarOrder.ts` verbatim: pinned rows (most
/// recently pinned first) are pulled out of the list entirely; everything
/// else is ordered by most-recent interaction, falling back to declared
/// order for rows that have never been interacted with.
LibraryRowOrder orderLibraryRows(List<LibraryRow> rows, List<LibrarySidebarItem> state) {
  final stateByKey = <String, LibrarySidebarItem>{
    for (final s in state) '${s.itemType}:${s.itemKey}': s,
  };

  final pinned = <LibraryRow>[];
  final interacted = <LibraryRow>[];
  final untouched = <LibraryRow>[];

  final pinnedAtByRow = <LibraryRow, DateTime>{};
  final interactedAtByRow = <LibraryRow, DateTime>{};

  for (final row in rows) {
    final s = stateByKey['${row.itemType}:${row.itemKey}'];
    if (s?.pinnedAt != null) {
      pinned.add(row);
      pinnedAtByRow[row] = s!.pinnedAt!;
    } else if (s != null) {
      interacted.add(row);
      interactedAtByRow[row] = s.lastInteractedAt;
    } else {
      untouched.add(row);
    }
  }

  pinned.sort((a, b) => pinnedAtByRow[b]!.compareTo(pinnedAtByRow[a]!));
  interacted.sort((a, b) => interactedAtByRow[b]!.compareTo(interactedAtByRow[a]!));
  // `untouched` keeps its original declared order (stable sort, no-op).

  return LibraryRowOrder(pinned: pinned, dynamic_: [...interacted, ...untouched]);
}
