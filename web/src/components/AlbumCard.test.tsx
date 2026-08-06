// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AlbumCard } from './AlbumCard';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import * as subsonic from '../api/subsonic';
import type { Album, Song } from '../api/types';

const album: Album = {
  id: 'al-1', name: 'Test Album', artist: 'Test Artist', artistId: 'ar-1',
  songCount: 2, duration: 300, created: '2024-01-01',
};

const songs: Song[] = [
  { id: 't-1', title: 'Song 1', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1', created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3' },
  { id: 't-2', title: 'Song 2', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1', created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3' },
];

function renderCard() {
  return render(
    <MemoryRouter>
      <AlbumCard album={album} />
    </MemoryRouter>,
  );
}

function openContextMenu() {
  const card = screen.getByText('Test Album').closest('.group')!;
  fireEvent.contextMenu(card);
}

beforeEach(() => {
  vi.spyOn(subsonic, 'getAlbum').mockResolvedValue({ ...album, song: songs });
});

describe('AlbumCard context menu', () => {
  it('adds every track to the queue in order on "Add to queue"', async () => {
    const addToQueue = vi.fn();
    usePlayerStore.setState({ addToQueue });
    const user = userEvent.setup();
    renderCard();

    openContextMenu();
    await user.click(await screen.findByText('Add to queue'));

    expect(addToQueue).toHaveBeenNthCalledWith(1, songs[0]);
    expect(addToQueue).toHaveBeenNthCalledWith(2, songs[1]);
  });

  it('queues every track next, preserving album order right after the current track', async () => {
    const playNext = vi.fn();
    usePlayerStore.setState({ playNext });
    const user = userEvent.setup();
    renderCard();

    openContextMenu();
    await user.click(await screen.findByText('Play next'));

    // playNext() always inserts immediately after the current track, so
    // calling it song-1-then-song-2 would leave the queue as [2, 1] — the
    // reversed call order in AlbumCard is what keeps it [1, 2].
    expect(playNext).toHaveBeenNthCalledWith(1, songs[1]);
    expect(playNext).toHaveBeenNthCalledWith(2, songs[0]);
  });

  it('requests a whole-album download with every track', async () => {
    const requestDownload = vi.fn();
    useDownloadsStore.setState({ requestDownload });
    const user = userEvent.setup();
    renderCard();

    openContextMenu();
    await user.click(await screen.findByText('Download'));

    expect(requestDownload).toHaveBeenCalledWith({ kind: 'album', songs });
  });
});
