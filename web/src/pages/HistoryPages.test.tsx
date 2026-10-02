// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecentlyPlayedPage } from './RecentlyPlayedPage';
import { MostPlayedPage } from './MostPlayedPage';
import * as subsonic from '../api/subsonic';
import type { Song } from '../api/types';

vi.mock('../components/StockCovers', () => ({ RecentlyPlayedCover: () => null, MostPlayedCover: () => null }));
vi.mock('../components/SongRow', () => ({
  SongRow: ({ song, index }: { song: Song; index: number }) => (
    <div data-testid="song">{`${index}. ${song.title}`}</div>
  ),
}));
vi.mock('../components/SystemViewHeader', () => ({
  SystemViewHeader: ({ viewKey, title, meta }: { viewKey: string; title: string; meta?: React.ReactNode }) => (
    <header data-view={viewKey}>
      <h1>{title}</h1>
      {meta && <p data-testid="meta">{meta}</p>}
    </header>
  ),
}));

const songs = (...titles: string[]) => titles.map((t, i) => ({ id: `s${i}`, title: t }) as Song);

function renderWith(page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('RecentlyPlayedPage', () => {
  beforeEach(() => {
    vi.spyOn(subsonic, 'getRecentlyPlayed').mockResolvedValue(songs('One', 'Two'));
  });

  it('uses the "recent" view header and lists tracks in the order given', async () => {
    renderWith(<RecentlyPlayedPage />);

    expect(await screen.findAllByTestId('song')).toHaveLength(2);
    expect(screen.getAllByTestId('song').map((s) => s.textContent)).toEqual(['1. One', '2. Two']);
    expect(screen.getByRole('heading', { name: 'Recently Played' })).toBeInTheDocument();
    expect(document.querySelector('[data-view="recent"]')).not.toBeNull();
    expect(screen.getByTestId('meta')).toHaveTextContent('2 tracks');
  });

  it('keeps a song that was played twice as two rows', async () => {
    const dup = { id: 'same', title: 'Loop' } as Song;
    vi.spyOn(subsonic, 'getRecentlyPlayed').mockResolvedValue([dup, dup]);
    renderWith(<RecentlyPlayedPage />);

    expect(await screen.findAllByTestId('song')).toHaveLength(2);
  });

  it('says "1 track" for one', async () => {
    vi.spyOn(subsonic, 'getRecentlyPlayed').mockResolvedValue(songs('Only'));
    renderWith(<RecentlyPlayedPage />);

    expect(await screen.findByTestId('meta')).toHaveTextContent(/^1 track$/);
  });

  it('shows placeholders while loading', () => {
    vi.spyOn(subsonic, 'getRecentlyPlayed').mockReturnValue(new Promise(() => {}));
    const { container } = renderWith(<RecentlyPlayedPage />);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(10);
  });

  it('shows an empty message and no summary without history', async () => {
    vi.spyOn(subsonic, 'getRecentlyPlayed').mockResolvedValue([]);
    renderWith(<RecentlyPlayedPage />);

    expect(await screen.findByText('No recently played tracks yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('meta')).not.toBeInTheDocument();
  });
});

describe('MostPlayedPage', () => {
  beforeEach(() => {
    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue(songs('Hit', 'Hit 2', 'Hit 3'));
  });

  it('uses the "most-played" view header and states the 30-day window', async () => {
    renderWith(<MostPlayedPage />);

    expect(await screen.findAllByTestId('song')).toHaveLength(3);
    expect(document.querySelector('[data-view="most-played"]')).not.toBeNull();
    expect(screen.getByTestId('meta')).toHaveTextContent('3 tracks · last 30 days');
  });

  it('says "1 track" for one', async () => {
    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue(songs('Only'));
    renderWith(<MostPlayedPage />);

    expect(await screen.findByTestId('meta')).toHaveTextContent('1 track · last 30 days');
  });

  it('shows placeholders while loading', () => {
    vi.spyOn(subsonic, 'getMostPlayed').mockReturnValue(new Promise(() => {}));
    const { container } = renderWith(<MostPlayedPage />);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(10);
  });

  it('shows an empty message when nothing was played in the window', async () => {
    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue([]);
    renderWith(<MostPlayedPage />);

    expect(await screen.findByText('No play history in the last 30 days.')).toBeInTheDocument();
    expect(screen.queryByTestId('meta')).not.toBeInTheDocument();
  });
});
