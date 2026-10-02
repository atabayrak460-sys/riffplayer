// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DownloadedPage } from './DownloadedPage';
import { useDownloadsStore } from '../store/downloads';
import * as offlineDb from '../lib/offlineDb';
import * as platform from '../lib/platform';
import type { Song } from '../api/types';

vi.mock('../components/CoverArt', () => ({ CoverArt: () => null }));
vi.mock('../components/StockCovers', () => ({ PlaylistCover: () => null, DownloadedCover: () => null }));
vi.mock('../components/SongRow', () => ({
  SongRow: ({ song, index }: { song: Song; index: number }) => (
    <div data-testid="song">{`${index}. ${song.title}`}</div>
  ),
}));
vi.mock('../components/SystemViewHeader', () => ({
  SystemViewHeader: ({ meta, viewKey }: { meta?: React.ReactNode; viewKey: string }) => (
    <header data-view={viewKey}>{meta !== undefined && <p data-testid="meta">{meta}</p>}</header>
  ),
}));

const track = (id: string, downloadedAt: number) => ({
  id, song: { id, title: `Song ${id}` } as Song, sizeBytes: 1, downloadedAt, retainedBy: [],
});
const playlist = (id: string, name: string, n: number) => ({
  id, name, downloadedAt: 0, trackIds: Array.from({ length: n }, (_, i) => `${id}-${i}`),
});

const removePlaylistDownload = vi.fn();

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DownloadedPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  removePlaylistDownload.mockClear();
  useDownloadsStore.setState({ removePlaylistDownload });
  vi.spyOn(platform, 'isIOS').mockReturnValue(false);
  vi.spyOn(offlineDb, 'getAllDownloadedPlaylists').mockResolvedValue([playlist('p1', 'Road trip', 2)]);
  vi.spyOn(offlineDb, 'getAllDownloadedTracks').mockResolvedValue([track('a', 100), track('b', 300), track('c', 200)] as never);
});

describe('DownloadedPage', () => {
  it('shows placeholders while loading', () => {
    vi.spyOn(offlineDb, 'getAllDownloadedTracks').mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6);
  });

  it('lists songs newest download first', async () => {
    renderPage();

    await screen.findAllByTestId('song');
    expect(screen.getAllByTestId('song').map((s) => s.textContent)).toEqual([
      '1. Song b', '2. Song c', '3. Song a',
    ]);
  });

  it('summarises playlists and tracks, pluralised', async () => {
    renderPage();
    expect(await screen.findByTestId('meta')).toHaveTextContent('1 playlist, 3 tracks');
  });

  it('uses the singular for one track and omits an empty category', async () => {
    vi.spyOn(offlineDb, 'getAllDownloadedPlaylists').mockResolvedValue([]);
    vi.spyOn(offlineDb, 'getAllDownloadedTracks').mockResolvedValue([track('a', 1)] as never);
    renderPage();

    expect(await screen.findByTestId('meta')).toHaveTextContent(/^1 track$/);
  });

  it('shows the empty hint and no summary when nothing is downloaded', async () => {
    vi.spyOn(offlineDb, 'getAllDownloadedPlaylists').mockResolvedValue([]);
    vi.spyOn(offlineDb, 'getAllDownloadedTracks').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no downloads yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('meta')).not.toBeInTheDocument();
    expect(screen.queryByText('Downloaded Playlists')).not.toBeInTheDocument();
  });

  it('lists downloaded playlists with a link to the offline view and a track count', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: /Road trip/ });
    expect(link).toHaveAttribute('href', '/downloaded/playlists/p1');
    expect(within(link).getByText('2 tracks')).toBeInTheDocument();
  });

  it('says "1 track" for a one-track playlist', async () => {
    vi.spyOn(offlineDb, 'getAllDownloadedPlaylists').mockResolvedValue([playlist('p1', 'Solo', 1)]);
    renderPage();

    expect(await screen.findByText('1 track')).toBeInTheDocument();
  });

  it('removing a playlist download calls the store with its id', async () => {
    renderPage();

    await userEvent.click(await screen.findByTitle('Remove download'));

    expect(removePlaylistDownload).toHaveBeenCalledWith('p1');
  });

  it('shows the iOS storage warning only on iOS', async () => {
    const { unmount } = renderPage();
    await screen.findAllByTestId('song');
    expect(screen.queryByText(/Safari may clear downloads/)).not.toBeInTheDocument();
    unmount();

    vi.spyOn(platform, 'isIOS').mockReturnValue(true);
    renderPage();
    expect(await screen.findByText(/Safari may clear downloads/)).toBeInTheDocument();
  });
});
