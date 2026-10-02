// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtistsPage } from './ArtistsPage';
import * as subsonic from '../api/subsonic';

vi.mock('../components/CoverArt', () => ({ CoverArt: () => null }));

const indexes = [
  { name: 'A', artist: [{ id: 'a1', name: 'ABBA', albumCount: 3 }, { id: 'a2', name: 'Air', albumCount: 1 }] },
  { name: 'B', artist: [{ id: 'b1', name: 'Beck', albumCount: 12 }] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ArtistsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(subsonic, 'getArtists').mockResolvedValue(indexes as never);
});

describe('ArtistsPage', () => {
  it('shows placeholders under the title while loading', () => {
    vi.spyOn(subsonic, 'getArtists').mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();

    expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(20);
  });

  it('shows an error when loading fails', async () => {
    vi.spyOn(subsonic, 'getArtists').mockRejectedValue(new Error('500'));
    renderPage();

    expect(await screen.findByText('Failed to load artists.')).toBeInTheDocument();
  });

  it('groups artists under their index letter, in order', async () => {
    renderPage();
    await screen.findByText('ABBA');

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['A', 'B']);
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual([
      '/artists/a1', '/artists/a2', '/artists/b1',
    ]);
  });

  it('shows each artist\'s album count, singular for one', async () => {
    renderPage();

    expect(within(await screen.findByRole('link', { name: /ABBA/ })).getByText('3 albums')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Air/ })).getByText('1 album')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Beck/ })).getByText('12 albums')).toBeInTheDocument();
  });

  it('renders just the title for an empty library', async () => {
    vi.spyOn(subsonic, 'getArtists').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Artists' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
