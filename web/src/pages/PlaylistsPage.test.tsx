// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlaylistsPage } from './PlaylistsPage';
import * as subsonic from '../api/subsonic';
import type { Playlist } from '../api/types';

vi.mock('../components/CoverArt', () => ({ CoverArt: () => null }));

const pl = (id: string, name: string): Playlist => ({
  id, name, owner: 'admin', songCount: 3, duration: 600, public: false, created: '', changed: '',
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlaylistsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([pl('1', 'Chill'), pl('2', 'Workout')]);
  vi.spyOn(subsonic, 'createPlaylistWithName').mockResolvedValue(pl('9', 'New'));
  vi.spyOn(subsonic, 'uploadPlaylistCover').mockResolvedValue(undefined as never);
  vi.spyOn(subsonic, 'deletePlaylist').mockResolvedValue(undefined as never);
});

async function openForm() {
  await userEvent.click(screen.getByRole('button', { name: '+ New playlist' }));
  return screen.getByPlaceholderText('Playlist name');
}

describe('PlaylistsPage', () => {
  it('lists the playlists', async () => {
    renderPage();

    expect(await screen.findByText('Chill')).toBeInTheDocument();
    expect(screen.getByText('Workout')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are none', async () => {
    vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No playlists yet.')).toBeInTheDocument();
  });

  it('keeps the create form hidden until "+ New playlist" is clicked, and toggles it', async () => {
    renderPage();
    expect(screen.queryByPlaceholderText('Playlist name')).not.toBeInTheDocument();

    await openForm();
    expect(screen.getByPlaceholderText('Playlist name')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+ New playlist' }));
    expect(screen.queryByPlaceholderText('Playlist name')).not.toBeInTheDocument();
  });

  it('Cancel closes the form', async () => {
    renderPage();
    await openForm();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByPlaceholderText('Playlist name')).not.toBeInTheDocument();
  });

  it('disables Create while the name is empty or only whitespace', async () => {
    renderPage();
    const name = await openForm();
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    await userEvent.type(name, '   ');
    expect(create).toBeDisabled();

    await userEvent.type(name, 'Mix');
    expect(create).toBeEnabled();
  });

  it('creates with a trimmed name and no comment when the description is blank', async () => {
    renderPage();
    await userEvent.type(await openForm(), '  Mix  ');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(subsonic.createPlaylistWithName).toHaveBeenCalledWith('Mix', undefined));
    expect(subsonic.uploadPlaylistCover).not.toHaveBeenCalled();
  });

  it('passes a trimmed description along', async () => {
    renderPage();
    await userEvent.type(await openForm(), 'Mix');
    await userEvent.type(screen.getByPlaceholderText('Description (optional)'), ' for the road ');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(subsonic.createPlaylistWithName).toHaveBeenCalledWith('Mix', 'for the road'),
    );
  });

  it('uploads the chosen cover to the newly created playlist', async () => {
    const { container } = renderPage();
    await userEvent.type(await openForm(), 'Mix');
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
    expect(screen.getByText('cover.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change cover…' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(subsonic.uploadPlaylistCover).toHaveBeenCalledWith('9', file));
  });

  it('still counts as created when the cover upload fails', async () => {
    vi.spyOn(subsonic, 'uploadPlaylistCover').mockRejectedValue(new Error('too big'));
    const { container } = renderPage();
    await userEvent.type(await openForm(), 'Mix');
    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['x'], 'cover.png', { type: 'image/png' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.queryByPlaceholderText('Playlist name')).not.toBeInTheDocument());
  });

  it('closes and resets the form after creating, and refetches the list', async () => {
    renderPage();
    await screen.findByText('Chill');
    await userEvent.type(await openForm(), 'Mix');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.queryByPlaceholderText('Playlist name')).not.toBeInTheDocument());
    await waitFor(() => expect(subsonic.getPlaylists).toHaveBeenCalledTimes(2));
    expect(await openForm()).toHaveValue('');
  });

  it('keeps the form open when creating fails', async () => {
    vi.spyOn(subsonic, 'createPlaylistWithName').mockRejectedValue(new Error('nope'));
    renderPage();
    await userEvent.type(await openForm(), 'Mix');

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(subsonic.createPlaylistWithName).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Playlist name')).toHaveValue('Mix');
  });

  it('deletes a playlist from its context menu after confirming, then refetches', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await userEvent.pointer({ keys: '[MouseRight]', target: await screen.findByText('Chill') });

    await userEvent.click(await screen.findByText('Delete playlist'));

    await waitFor(() => expect(subsonic.deletePlaylist).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(subsonic.getPlaylists).toHaveBeenCalledTimes(2));
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await userEvent.pointer({ keys: '[MouseRight]', target: await screen.findByText('Chill') });

    await userEvent.click(await screen.findByText('Delete playlist'));

    expect(subsonic.deletePlaylist).not.toHaveBeenCalled();
  });
});
