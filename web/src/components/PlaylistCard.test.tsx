// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PlaylistCard } from './PlaylistCard';
import { usePlayerStore } from '../store/player';
import { useDownloadsStore } from '../store/downloads';
import * as subsonic from '../api/subsonic';
import type { Playlist, Song } from '../api/types';

vi.mock('./CoverArt', () => ({ CoverArt: () => null }));

const songs = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }] as Song[];
const pl = (extra: Partial<Playlist> = {}): Playlist => ({
  id: 'p1', name: 'Road trip', owner: 'admin', songCount: 2, duration: 400,
  public: false, created: '', changed: '', ...extra,
});

const playQueue = vi.fn();
const requestDownload = vi.fn();
const removePlaylistDownload = vi.fn();

function renderCard(playlist = pl(), onDelete = vi.fn()) {
  render(
    <MemoryRouter>
      <PlaylistCard pl={playlist} onDelete={onDelete} />
    </MemoryRouter>,
  );
  return onDelete;
}

beforeEach(() => {
  vi.restoreAllMocks();
  playQueue.mockClear();
  requestDownload.mockClear();
  removePlaylistDownload.mockClear();
  usePlayerStore.setState({ playQueue });
  useDownloadsStore.setState({ status: {}, requestDownload, removePlaylistDownload });
  vi.spyOn(subsonic, 'getPlaylist').mockResolvedValue({ ...pl(), entry: songs });
});

describe('PlaylistCard', () => {
  it('links the name to the playlist page', () => {
    renderCard();

    expect(screen.getByRole('link', { name: 'Road trip' })).toHaveAttribute('href', '/playlists/p1');
  });

  it('pluralises the track count', () => {
    renderCard(pl({ songCount: 1 }));
    expect(screen.getByText('1 track')).toBeInTheDocument();
  });

  it('shows the description only when there is one', () => {
    renderCard(pl({ comment: 'Songs for the car' }));
    expect(screen.getByText('Songs for the car')).toBeInTheDocument();
  });

  it('plays the whole playlist (fetched in full) from the Play button', async () => {
    renderCard();

    await userEvent.click(screen.getByTitle('Play'));

    expect(subsonic.getPlaylist).toHaveBeenCalledWith('p1');
    expect(playQueue).toHaveBeenCalledWith(songs);
  });

  it('has no Play button for an empty playlist', () => {
    renderCard(pl({ songCount: 0 }));

    expect(screen.queryByTitle('Play')).not.toBeInTheDocument();
  });

  it('does not start playback when fetching the playlist fails', async () => {
    vi.spyOn(subsonic, 'getPlaylist').mockRejectedValue(new Error('offline'));
    renderCard();

    await userEvent.click(screen.getByTitle('Play'));

    expect(playQueue).not.toHaveBeenCalled();
  });

  it('right-click → Download requests a playlist download with the full track list', async () => {
    renderCard();

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Road trip') });
    await userEvent.click(await screen.findByText('Download'));

    expect(requestDownload).toHaveBeenCalledWith({
      kind: 'playlist', playlist: expect.objectContaining({ id: 'p1' }), songs,
    });
  });

  it('right-click on a downloaded playlist offers Remove download instead', async () => {
    useDownloadsStore.setState({ status: { 'p:p1': 'downloaded' } });
    renderCard();

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Road trip') });
    await userEvent.click(await screen.findByText('Remove download'));

    expect(removePlaylistDownload).toHaveBeenCalledWith('p1');
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });

  it('Delete playlist asks for confirmation and deletes only when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const onDelete = renderCard();

    confirmSpy.mockReturnValueOnce(false);
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Road trip') });
    await userEvent.click(await screen.findByText('Delete playlist'));
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Road trip"?');
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Road trip') });
    await userEvent.click(await screen.findByText('Delete playlist'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
