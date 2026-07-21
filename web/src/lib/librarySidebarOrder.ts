import type { ComponentType } from 'react';

export interface LibraryRow {
  itemType: 'system' | 'playlist';
  itemKey: string;
  to: string;
  label: string;
  /** Playlist rows: the playlist's real cover id, if it has one (falls back to the stock Playlist SVG). */
  coverArt?: string;
  /** System-view rows: which stock SVG represents this view. */
  StockCover?: ComponentType<{ className?: string }>;
}

export interface LibrarySidebarStateEntry {
  itemType: string;
  itemKey: string;
  pinnedAt: string | null;
  lastInteractedAt: string;
}

/**
 * Pinned rows sit in their own block above, most-recently-pinned first, and
 * never move for any other reason. Everything else sorts by last-interacted
 * time (most recent first); anything never opened keeps its original fixed
 * position and sinks to the bottom of that group.
 */
export function orderLibraryRows(rows: LibraryRow[], state: LibrarySidebarStateEntry[]) {
  const stateByKey = new Map(state.map((s) => [`${s.itemType}:${s.itemKey}`, s]));
  const withState = rows.map((row, originalIndex) => {
    const s = stateByKey.get(`${row.itemType}:${row.itemKey}`);
    return {
      ...row,
      originalIndex,
      pinnedAt: s?.pinnedAt ?? null,
      lastInteractedAt: s?.lastInteractedAt ?? null,
    };
  });

  const pinned = withState
    .filter((r) => r.pinnedAt)
    .sort((a, b) => new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime());

  const unpinned = withState.filter((r) => !r.pinnedAt);
  const interacted = unpinned
    .filter((r) => r.lastInteractedAt)
    .sort((a, b) => new Date(b.lastInteractedAt!).getTime() - new Date(a.lastInteractedAt!).getTime());
  const untouched = unpinned
    .filter((r) => !r.lastInteractedAt)
    .sort((a, b) => a.originalIndex - b.originalIndex);

  return { pinned, dynamic: [...interacted, ...untouched] };
}
