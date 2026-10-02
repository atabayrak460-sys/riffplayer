// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchPage } from './SearchPage';
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

const artist = { id: 'ar1', name: 'Radiohead' } as Artist;
const album = { id: 'al1', name: 'OK Computer' } as Album;
const song = { id: 's1', title: 'Karma Police' } as Song;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function searchFor(text: string) {
  await userEvent.type(screen.getByPlaceholderText('Artists, albums, songs…'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Search' }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'search').mockResolvedValue({ artist: [artist], album: [album], song: [song] });
});

describe('SearchPage', () => {
  it('focuses the box and shows nothing before a search', () => {
    renderPage();

    expect(screen.getByPlaceholderText('Artists, albums, songs…')).toHaveFocus();
    expect(screen.queryByText('Artists')).not.toBeInTheDocument();
    expect(subsonic.search).not.toHaveBeenCalled();
  });

  it('does not search while typing, only on submit', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('Artists, albums, songs…'), 'radio');

    expect(subsonic.search).not.toHaveBeenCalled();
  });

  it('submitting with Enter searches', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText('Artists, albums, songs…'), 'radio{Enter}');

    await waitFor(() => expect(subsonic.search).toHaveBeenCalledWith('radio'));
  });

  it('trims the query before searching', async () => {
    renderPage();
    await searchFor('  radio  ');

    await waitFor(() => expect(subsonic.search).toHaveBeenCalledWith('radio'));
  });

  it('an empty or whitespace-only query never calls the API', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await searchFor('   ');

    expect(subsonic.search).not.toHaveBeenCalled();
  });

  it('shows Searching… while the request is pending', async () => {
    vi.spyOn(subsonic, 'search').mockReturnValue(new Promise(() => {}));
    renderPage();
    await searchFor('radio');

    expect(await screen.findByText('Searching…')).toBeInTheDocument();
  });

  it('shows artists (linked), albums and songs under their own headings', async () => {
    renderPage();
    await searchFor('radio');

    expect(await screen.findByRole('link', { name: 'Radiohead' })).toHaveAttribute('href', '/artists/ar1');
    expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Songs' })).toBeInTheDocument();
    expect(screen.getByTestId('album')).toHaveTextContent('OK Computer');
    expect(screen.getByTestId('song')).toHaveTextContent('1. Karma Police');
  });

  it('leaves out the headings of empty result groups', async () => {
    vi.spyOn(subsonic, 'search').mockResolvedValue({ artist: [], album: [], song: [song] });
    renderPage();
    await searchFor('karma');

    expect(await screen.findByRole('heading', { name: 'Songs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Artists' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Albums' })).not.toBeInTheDocument();
  });

  it('says so when nothing matches, quoting the submitted (trimmed) query', async () => {
    vi.spyOn(subsonic, 'search').mockResolvedValue({ artist: [], album: [], song: [] });
    renderPage();
    await searchFor(' zzz ');

    expect(await screen.findByText('No results for "zzz".')).toBeInTheDocument();
  });

  it('does not change the quoted query while the user keeps typing', async () => {
    vi.spyOn(subsonic, 'search').mockResolvedValue({ artist: [], album: [], song: [] });
    renderPage();
    await searchFor('zzz');
    await screen.findByText('No results for "zzz".');

    await userEvent.type(screen.getByPlaceholderText('Artists, albums, songs…'), 'more');

    expect(screen.getByText('No results for "zzz".')).toBeInTheDocument();
  });
});
