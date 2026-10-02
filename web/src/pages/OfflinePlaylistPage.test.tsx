// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflinePlaylistPage } from './OfflinePlaylistPage';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import * as offlineDb from '../lib/offlineDb';
import type { Song } from '../api/types';

vi.mock('../components/CoverArt', () => ({ CoverArt: () => null }));
vi.mock('../components/StockCovers', () => ({ PlaylistCover: () => null }));
vi.mock('../components/SongRow', () => ({
  SongRow: ({ song, index }: { song: Song; index: number }) => (
    <div data-testid="song">{`${index}. ${song.title}`}</div>
  ),
}));

const meta = (extra = {}) => ({
  id: 'p1', name: 'Road trip', downloadedAt: 0, trackIds: ['a', 'b'], ...extra,
});
const track = (id: string) => ({ id, song: { id, title: `Song ${id}` } as Song, sizeBytes: 1, downloadedAt: 0, retainedBy: [] });

const playQueue = vi.fn();
const removePlaylistDownload = vi.fn();

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/downloaded/playlists/p1']}>
        <Routes>
          <Route path="/downloaded/playlists/:id" element={<OfflinePlaylistPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  playQueue.mockClear();
  removePlaylistDownload.mockClear();
  usePlayerStore.setState({ playQueue });
  useDownloadsStore.setState({ removePlaylistDownload });
  vi.spyOn(offlineDb, 'getDownloadedPlaylist').mockResolvedValue(meta() as never);
  vi.spyOn(offlineDb, 'getTracksByIds').mockResolvedValue([track('a'), track('b')] as never);
});

describe('OfflinePlaylistPage', () => {
  it('shows Loading… first', () => {
    renderPage();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('says the playlist isn\'t downloaded when it is unknown', async () => {
    vi.spyOn(offlineDb, 'getDownloadedPlaylist').mockResolvedValue(undefined);
    renderPage();

    expect(await screen.findByText("This playlist isn't downloaded.")).toBeInTheDocument();
    expect(offlineDb.getTracksByIds).not.toHaveBeenCalled();
  });

  it('shows the name, the track count and the tracks in order', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Road trip' })).toBeInTheDocument();
    expect(screen.getByText('2 tracks')).toBeInTheDocument();
    expect(screen.getAllByTestId('song').map((s) => s.textContent)).toEqual(['1. Song a', '2. Song b']);
    expect(offlineDb.getTracksByIds).toHaveBeenCalledWith(['a', 'b']);
  });

  it('shows the description when there is one', async () => {
    vi.spyOn(offlineDb, 'getDownloadedPlaylist').mockResolvedValue(meta({ comment: 'Songs for the car' }) as never);
    renderPage();

    expect(await screen.findByText('Songs for the car')).toBeInTheDocument();
  });

  it('counts (and pluralises) only the tracks that are actually still on the device', async () => {
    vi.spyOn(offlineDb, 'getTracksByIds').mockResolvedValue([track('a')] as never);
    renderPage();

    expect(await screen.findByText('1 track')).toBeInTheDocument();
    expect(screen.getAllByTestId('song')).toHaveLength(1);
  });

  it('Play queues the downloaded songs', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));

    expect(playQueue.mock.calls[0][0].map((s: Song) => s.id)).toEqual(['a', 'b']);
  });

  it('with no tracks left: disabled Play and "No tracks."', async () => {
    vi.spyOn(offlineDb, 'getTracksByIds').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No tracks.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('Remove download removes this playlist\'s download', async () => {
    renderPage();
    await userEvent.click(await screen.findByTitle('Remove download'));

    expect(removePlaylistDownload).toHaveBeenCalledWith('p1');
  });
});
