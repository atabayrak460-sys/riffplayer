// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlbumDetailPage } from './AlbumDetailPage';
import { useDownloadsStore } from '../store/downloads';
import * as subsonic from '../api/subsonic';
import type { Album, Song } from '../api/types';

const songs: Song[] = ['t-1', 't-2'].map((id) => ({
  id, title: `Song ${id}`, album: 'Test Album', albumId: 'al-1', artist: 'Test Artist',
  artistId: 'ar-1', created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3',
}));

const album = {
  id: 'al-1', name: 'Test Album', artist: 'Test Artist', artistId: 'ar-1',
  songCount: 2, duration: 300, created: '2024-01-01', song: songs,
} as Album & { song: Song[] };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/albums/al-1']}>
        <Routes>
          <Route path="/albums/:id" element={<AlbumDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const requestDownload = vi.fn();
const removeTrackDownload = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.restoreAllMocks();
  requestDownload.mockClear();
  removeTrackDownload.mockClear();
  vi.spyOn(subsonic, 'getAlbum').mockResolvedValue(album);
  useDownloadsStore.setState({ status: {}, requestDownload, removeTrackDownload });
});

describe('AlbumDetailPage download button', () => {
  it('shows a visible, labeled Download button that requests an album download', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /^download$/i }));

    expect(requestDownload).toHaveBeenCalledWith({ kind: 'album', songs });
  });

  it('shows a disabled Downloading… state while any track is downloading', async () => {
    useDownloadsStore.setState({ status: { 't:t-1': 'downloaded', 't:t-2': 'downloading' } });
    renderPage();

    expect(await screen.findByRole('button', { name: /downloading/i })).toBeDisabled();
  });

  it('shows Downloaded once every track is downloaded, and removes them on click', async () => {
    useDownloadsStore.setState({ status: { 't:t-1': 'downloaded', 't:t-2': 'downloaded' } });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /^downloaded$/i }));

    expect(removeTrackDownload).toHaveBeenCalledTimes(2);
    expect(removeTrackDownload).toHaveBeenCalledWith('t-1');
    expect(removeTrackDownload).toHaveBeenCalledWith('t-2');
  });

  it('is not "Downloaded" when only some tracks are downloaded', async () => {
    useDownloadsStore.setState({ status: { 't:t-1': 'downloaded' } });
    renderPage();

    expect(await screen.findByRole('button', { name: /^download$/i })).toBeInTheDocument();
  });
});
