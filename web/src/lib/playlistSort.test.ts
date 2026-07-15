import { describe, it, expect } from 'vitest';
import { sortPlaylistTracks } from './playlistSort';
import type { Song } from '../api/types';

function song(id: string): Song {
  return {
    id, title: `Track ${id}`, album: 'Album', albumId: 'al-1', artist: 'Artist', artistId: 'ar-1',
    created: '2024-01-01', isVideo: false, type: 'music',
  };
}

const songs = [song('a'), song('b'), song('c')];
const dates = {
  a: '2024-01-15T00:00:00.000Z',
  b: '2024-01-01T00:00:00.000Z', // earliest
  c: '2024-02-01T00:00:00.000Z', // latest
};

describe('sortPlaylistTracks', () => {
  it('"custom" returns the list exactly as given, ignoring dates', () => {
    const result = sortPlaylistTracks(songs, dates, 'custom');
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('"custom" does not require dates to be loaded', () => {
    const result = sortPlaylistTracks(songs, undefined, 'custom');
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('"addedAsc" sorts oldest first', () => {
    const result = sortPlaylistTracks(songs, dates, 'addedAsc');
    expect(result.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('"addedDesc" sorts newest first', () => {
    const result = sortPlaylistTracks(songs, dates, 'addedDesc');
    expect(result.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('falls back to the original (custom) order when dates have not loaded yet', () => {
    const result = sortPlaylistTracks(songs, undefined, 'addedAsc');
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const original = [...songs];
    sortPlaylistTracks(songs, dates, 'addedAsc');
    expect(songs).toEqual(original);
  });

  it('treats a track with a missing date as earliest (empty string sorts first)', () => {
    const partialDates = { a: '2024-01-15T00:00:00.000Z', c: '2024-02-01T00:00:00.000Z' }; // b missing
    const result = sortPlaylistTracks(songs, partialDates, 'addedAsc');
    expect(result.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
});
