// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useArtistSongs } from './useArtistSongs';
import * as subsonic from '../api/subsonic';
import type { Album, Artist, Song } from '../api/types';

const song = (id: string, title: string) => ({ id, title }) as Song;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const artist = (albums: string[]) =>
  ({ id: 'ar1', name: 'The Band', album: albums.map((id) => ({ id })) }) as unknown as Artist & { album: Album[] };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist(['al1', 'al2']));
  vi.spyOn(subsonic, 'getAlbum').mockImplementation(async (id: string) =>
    ({ id, song: id === 'al1' ? [song('s2', 'Zebra'), song('s1', 'apple')] : [song('s3', 'Mango')] }) as never,
  );
});

describe('useArtistSongs', () => {
  it('collects every album\'s songs, sorted by title (case-insensitively, via localeCompare)', async () => {
    const { result } = renderHook(() => useArtistSongs('ar1'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.songs).toHaveLength(3));
    expect(result.current.songs.map((s) => s.title)).toEqual(['apple', 'Mango', 'Zebra']);
    expect(result.current.artist?.name).toBe('The Band');
    expect(subsonic.getAlbum).toHaveBeenCalledWith('al1');
    expect(subsonic.getAlbum).toHaveBeenCalledWith('al2');
  });

  it('does nothing without an artist id', async () => {
    renderHook(() => useArtistSongs(undefined), { wrapper: wrapper() });

    await new Promise((r) => setTimeout(r, 20));
    expect(subsonic.getArtist).not.toHaveBeenCalled();
    expect(subsonic.getAlbum).not.toHaveBeenCalled();
  });

  it('loads the artist but not the albums while disabled', async () => {
    const { result } = renderHook(() => useArtistSongs('ar1', false), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.artist).toBeDefined());
    expect(subsonic.getAlbum).not.toHaveBeenCalled();
    expect(result.current.songs).toEqual([]);
  });

  it('does not fetch songs for an artist without albums', async () => {
    vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist([]));
    const { result } = renderHook(() => useArtistSongs('ar1'), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.artist).toBeDefined());
    expect(subsonic.getAlbum).not.toHaveBeenCalled();
    expect(result.current.songs).toEqual([]);
  });

  it('treats an album without a song list as empty', async () => {
    vi.spyOn(subsonic, 'getAlbum').mockResolvedValue({ id: 'x' } as never);
    const { result } = renderHook(() => useArtistSongs('ar1'), { wrapper: wrapper() });

    await waitFor(() => expect(subsonic.getAlbum).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.songs).toEqual([]);
  });
});
