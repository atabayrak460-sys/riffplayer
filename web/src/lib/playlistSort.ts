import type { Song } from '../api/types';

export type PlaylistSortMode = 'custom' | 'addedAsc' | 'addedDesc';

/**
 * Sort a playlist's tracks for display. 'custom' returns the list untouched
 * (the server-persisted drag order). The date-added modes are a pure display
 * transform — they never mutate `songs` or trigger any save, which is what
 * keeps switching sort views from disturbing the saved custom order.
 */
export function sortPlaylistTracks(
  songs: Song[],
  dates: Record<string, string> | undefined,
  mode: PlaylistSortMode,
): Song[] {
  if (mode === 'custom' || !dates) return songs;

  return [...songs].sort((a, b) => {
    const da = dates[a.id] ?? '';
    const db = dates[b.id] ?? '';
    const cmp = da < db ? -1 : da > db ? 1 : 0;
    return mode === 'addedAsc' ? cmp : -cmp;
  });
}
