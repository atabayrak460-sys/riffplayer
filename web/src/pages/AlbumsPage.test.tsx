// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlbumsPage } from './AlbumsPage';
import * as subsonic from '../api/subsonic';
import type { Album } from '../api/types';

vi.mock('../components/AlbumCard', () => ({
  AlbumCard: ({ album }: { album: Album }) => <div data-testid="album">{album.name}</div>,
}));

const albums = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }] as Album[];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AlbumsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'getAlbumList').mockResolvedValue(albums);
});

describe('AlbumsPage', () => {
  it('loads 100 recently added albums by default', async () => {
    renderPage();

    expect(await screen.findAllByTestId('album')).toHaveLength(2);
    expect(subsonic.getAlbumList).toHaveBeenCalledWith('newest', { size: 100 });
    expect(screen.getByRole('combobox')).toHaveValue('newest');
  });

  it('offers every sort order', () => {
    renderPage();

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Recently Added', 'Recently Played', 'Most Played', 'Starred', 'A–Z', 'By Artist', 'Random',
    ]);
  });

  it.each([
    ['Recently Played', 'recent'],
    ['Most Played', 'frequent'],
    ['Starred', 'starred'],
    ['A–Z', 'alphabeticalByName'],
    ['By Artist', 'alphabeticalByArtist'],
    ['Random', 'random'],
  ])('choosing "%s" requests type %s', async (label, type) => {
    renderPage();
    await screen.findAllByTestId('album');

    await userEvent.selectOptions(screen.getByRole('combobox'), label);

    await waitFor(() => expect(subsonic.getAlbumList).toHaveBeenCalledWith(type, { size: 100 }));
  });

  it('shows placeholders while loading', () => {
    vi.spyOn(subsonic, 'getAlbumList').mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(container.querySelectorAll('.aspect-square.animate-pulse')).toHaveLength(24);
  });

  it('shows an error when loading fails', async () => {
    vi.spyOn(subsonic, 'getAlbumList').mockRejectedValue(new Error('500'));
    renderPage();

    expect(await screen.findByText('Failed to load albums.')).toBeInTheDocument();
    expect(screen.queryByText(/no albums found/i)).not.toBeInTheDocument();
  });

  it('suggests indexing when the library is empty', async () => {
    vi.spyOn(subsonic, 'getAlbumList').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no albums found/i)).toBeInTheDocument();
  });
});
