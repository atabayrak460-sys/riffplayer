// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtistDetailPage } from './ArtistDetailPage';
import { usePlayerStore } from '../store/player';
import { useAuthStore } from '../store/auth';
import * as subsonic from '../api/subsonic';
import type { Album, Artist, Song } from '../api/types';

vi.mock('../components/AlbumCard', () => ({
  AlbumCard: ({ album }: { album: Album }) => <div data-testid="album">{album.name}</div>,
}));
vi.mock('../components/SongRow', () => ({
  SongRow: ({ song, index }: { song: Song; index: number }) => (
    <div data-testid="song">{`${index}. ${song.title}`}</div>
  ),
}));
vi.mock('../components/StarButton', () => ({
  StarButton: ({ starred, opts }: { starred: boolean; opts: { artistId?: string } }) => (
    <span data-testid="star">{`${starred ? 'starred' : 'unstarred'}:${opts.artistId}`}</span>
  ),
}));
vi.mock('../components/CoverUploadControl', () => ({
  CoverUploadControl: (p: {
    visible?: boolean; hasCover: boolean; error?: string | null;
    onUpload: (f: File) => void; onRemove: () => void;
  }) => (
    <div data-testid="cover" data-visible={String(p.visible)} data-has-cover={String(p.hasCover)}>
      <button onClick={() => p.onUpload(new File(['x'], 'c.png'))}>upload photo</button>
      <button onClick={p.onRemove}>remove photo</button>
      {p.error && <span>{p.error}</span>}
    </div>
  ),
}));

const albumA = { id: 'al1', name: 'Alpha' } as Album;
const albumB = { id: 'al2', name: 'Beta' } as Album;
const songs: Record<string, Song[]> = {
  al1: [{ id: 's2', title: 'Zebra' } as Song, { id: 's1', title: 'Apple' } as Song],
  al2: [{ id: 's3', title: 'Mango' } as Song],
};

const artist = (extra: Record<string, unknown> = {}) =>
  ({ id: 'ar1', name: 'The Band', album: [albumA, albumB], ...extra }) as unknown as Artist & { album: Album[] };

const playQueue = vi.fn();

function renderPage(url = '/artists/ar1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/artists/:id" element={<ArtistDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  playQueue.mockClear();
  usePlayerStore.setState({ playQueue });
  useAuthStore.setState({ user: { id: 1, username: 'u', role: 'user' } });
  vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist());
  vi.spyOn(subsonic, 'getAlbum').mockImplementation(
    async (id: string) => ({ id, song: songs[id] }) as never,
  );
  vi.spyOn(subsonic, 'uploadArtistCover').mockResolvedValue(undefined as never);
  vi.spyOn(subsonic, 'removeArtistCover').mockResolvedValue(undefined as never);
});

describe('ArtistDetailPage', () => {
  it('shows a skeleton while loading', () => {
    vi.spyOn(subsonic, 'getArtist').mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('says "Artist not found." when loading fails', async () => {
    vi.spyOn(subsonic, 'getArtist').mockRejectedValue(new Error('404'));
    renderPage();

    expect(await screen.findByText('Artist not found.')).toBeInTheDocument();
  });

  it('shows the name, a pluralised album count and the albums tab by default', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'The Band' })).toBeInTheDocument();
    expect(screen.getByText('2 albums')).toBeInTheDocument();
    expect(screen.getAllByTestId('album').map((a) => a.textContent)).toEqual(['Alpha', 'Beta']);
    expect(screen.queryAllByTestId('song')).toHaveLength(0);
  });

  it('says "1 album" for a single album', async () => {
    vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist({ album: [albumA] }));
    renderPage();

    expect(await screen.findByText('1 album')).toBeInTheDocument();
  });

  it('handles an artist without an album list', async () => {
    vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist({ album: undefined }));
    renderPage();

    expect(await screen.findByText('0 albums')).toBeInTheDocument();
  });

  it('passes the artist\'s starred state to the star button', async () => {
    vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist({ starred: '2024-01-01' }));
    renderPage();

    expect(await screen.findByTestId('star')).toHaveTextContent('starred:ar1');
  });

  it('Songs tab lists every album\'s songs sorted by title', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Songs' }));

    await waitFor(() =>
      expect(screen.getAllByTestId('song').map((s) => s.textContent)).toEqual([
        '1. Apple', '2. Mango', '3. Zebra',
      ]),
    );
    expect(screen.queryAllByTestId('album')).toHaveLength(0);
  });

  it('?tab=songs opens straight on the Songs tab', async () => {
    renderPage('/artists/ar1?tab=songs');

    expect(await screen.findByText('1. Apple')).toBeInTheDocument();
  });

  it('can switch back to Albums', async () => {
    renderPage('/artists/ar1?tab=songs');
    await screen.findByText('1. Apple');

    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));

    expect(screen.getAllByTestId('album')).toHaveLength(2);
  });

  it('says "No songs found." when the albums have none', async () => {
    vi.spyOn(subsonic, 'getAlbum').mockResolvedValue({ id: 'x', song: undefined } as never);
    renderPage('/artists/ar1?tab=songs');

    expect(await screen.findByText('No songs found.')).toBeInTheDocument();
  });

  it('does not fetch every album while only the Albums tab is open', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'The Band' });

    expect(subsonic.getAlbum).not.toHaveBeenCalled();
  });

  it('Play all queues the songs of every album', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Play all' }));

    await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
    expect(playQueue.mock.calls[0][0].map((s: Song) => s.id)).toEqual(['s2', 's1', 's3']);
  });

  it('Play all does nothing when the artist has no songs', async () => {
    vi.spyOn(subsonic, 'getAlbum').mockResolvedValue({ id: 'x', song: [] } as never);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Play all' }));

    await waitFor(() => expect(subsonic.getAlbum).toHaveBeenCalled());
    expect(playQueue).not.toHaveBeenCalled();
  });
});

describe('ArtistDetailPage — photo', () => {
  it('only admins get the upload controls', async () => {
    renderPage();
    expect((await screen.findByTestId('cover')).dataset.visible).toBe('false');
  });

  it('shows them to an admin', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'a', role: 'admin' } });
    renderPage();
    expect((await screen.findByTestId('cover')).dataset.visible).toBe('true');
  });

  it('uploads and removes the photo', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'a', role: 'admin' } });
    renderPage();

    await userEvent.click(await screen.findByText('upload photo'));
    await waitFor(() => expect(subsonic.uploadArtistCover).toHaveBeenCalledWith('ar1', expect.any(File)));

    await userEvent.click(screen.getByText('remove photo'));
    await waitFor(() => expect(subsonic.removeArtistCover).toHaveBeenCalledWith('ar1'));
  });

  it('knows whether the artist already has a photo', async () => {
    vi.spyOn(subsonic, 'getArtist').mockResolvedValue(artist({ coverArt: 'ar-ar1' }));
    renderPage();
    expect((await screen.findByTestId('cover')).dataset.hasCover).toBe('true');
  });

  it('shows the upload error', async () => {
    vi.spyOn(subsonic, 'uploadArtistCover').mockRejectedValue(new Error('Not an image'));
    useAuthStore.setState({ user: { id: 1, username: 'a', role: 'admin' } });
    renderPage();

    await userEvent.click(await screen.findByText('upload photo'));

    expect(await screen.findByText('Not an image')).toBeInTheDocument();
  });
});
