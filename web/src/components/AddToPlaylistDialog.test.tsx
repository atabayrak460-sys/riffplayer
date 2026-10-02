// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import * as subsonic from '../api/subsonic';

const EXISTING_PLAYLIST = { id: 'p-1', name: 'My Playlist', owner: 'admin', songCount: 0, duration: 0, public: false, created: '2024-01-01', changed: '2024-01-01' };

beforeEach(() => {
  vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([EXISTING_PLAYLIST]);
  vi.spyOn(subsonic, 'addSongToPlaylist').mockResolvedValue(undefined);
  vi.spyOn(subsonic, 'createPlaylistWithName').mockResolvedValue({ ...EXISTING_PLAYLIST, id: 'p-2', name: 'New Playlist 2' });
});

function renderDialog(onClose = vi.fn()) {
  const qc = new QueryClient();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={qc}>
        <AddToPlaylistDialog songId="t-1" onClose={onClose} />
      </QueryClientProvider>,
    ),
  };
}

describe('AddToPlaylistDialog', () => {
  it('renders as an accessible dialog listing playlists', async () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Add to playlist' })).toBeInTheDocument();
    expect(await screen.findByText('My Playlist')).toBeInTheDocument();
  });

  it('offers "New playlist" even when no playlists exist yet', async () => {
    // Regression: this dialog used to only list *existing* playlists — with
    // none created yet, there was no way to add the song to a playlist at
    // all short of leaving the dialog and creating one blank elsewhere first.
    vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText('No playlists yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new playlist/i })).toBeInTheDocument();
  });

  it('creating a new playlist adds the song to it and closes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await screen.findByText('My Playlist');

    await user.click(screen.getByRole('button', { name: /new playlist/i }));

    expect(subsonic.createPlaylistWithName).toHaveBeenCalledWith('New Playlist 2');
    await waitFor(() => expect(subsonic.addSongToPlaylist).toHaveBeenCalledWith('p-2', 't-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
