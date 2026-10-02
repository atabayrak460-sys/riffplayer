// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FavoritesPage } from './FavoritesPage';
import * as subsonic from '../api/subsonic';
import type { Album, Artist, Song } from '../api/types';

vi.mock('../components/CoverArt', () => ({ CoverArt: () => null }));
vi.mock('../components/AlbumCard', () => ({
  AlbumCard: ({ album }: { album: Album }) => <div data-testid="album">{album.name}</div>,
}));
vi.mock('../components/SongRow', () => ({
  SongRow: ({ song, index }: { song: Song; index: number }) => (
    <div data-testid="song">{`${index}. ${song.title}`}</div>
  ),
}));
vi.mock('../components/SystemViewHeader', () => ({
  SystemViewHeader: ({ title, meta, viewKey }: { title: string; meta?: React.ReactNode; viewKey: string }) => (
    <header data-view={viewKey}>
      <h1>{title}</h1>
      {meta && <p data-testid="meta">{meta}</p>}
    </header>
  ),
}));

const artists = [{ id: 'ar1', name: 'Radiohead' }] as Artist[];
const albums = [{ id: 'al1', name: 'OK Computer' }, { id: 'al2', name: 'Kid A' }] as Album[];
const songs = [{ id: 's1', title: 'Karma Police' }] as Song[];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'getStarred').mockResolvedValue({ artist: artists, album: albums, song: songs });
});

describe('FavoritesPage', () => {
  it('shows a loading message first', () => {
    renderPage();
    expect(screen.getByText('Loading favourites…')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    vi.spyOn(subsonic, 'getStarred').mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Failed to load favourites.')).toBeInTheDocument();
  });

  it('renders the header for the favorites view with a pluralised summary', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Favourites' })).toBeInTheDocument();
    expect(document.querySelector('[data-view="favorites"]')).not.toBeNull();
    expect(screen.getByTestId('meta')).toHaveTextContent('1 artist, 2 albums, 1 song starred');
  });

  it('lists artists (linked), albums and songs', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Radiohead' })).toHaveAttribute('href', '/artists/ar1');
    expect(screen.getAllByTestId('album').map((a) => a.textContent)).toEqual(['OK Computer', 'Kid A']);
    expect(screen.getByTestId('song')).toHaveTextContent('1. Karma Police');
  });

  it('omits the summary for categories with nothing starred', async () => {
    vi.spyOn(subsonic, 'getStarred').mockResolvedValue({ artist: [], album: [], song: [songs[0], { id: 's2', title: 'Two' } as Song] });
    renderPage();

    expect(await screen.findByTestId('meta')).toHaveTextContent(/^2 songs starred$/);
    expect(screen.queryByRole('heading', { name: 'Artists' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Albums' })).not.toBeInTheDocument();
  });

  it('shows a hint and no summary when nothing is starred', async () => {
    vi.spyOn(subsonic, 'getStarred').mockResolvedValue({ artist: [], album: [], song: [] });
    renderPage();

    expect(await screen.findByText(/nothing starred yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('meta')).not.toBeInTheDocument();
  });
});
