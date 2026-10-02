// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContinueListeningSection } from './ContinueListeningSection';
import { MostPlayedSection } from './MostPlayedSection';
import { RediscoverSection } from './RediscoverSection';
import { WrappedPreviewSection } from './WrappedPreviewSection';
import { HomeTrackCard } from './HomeTrackCard';
import { usePlayerStore } from '../../store/player';
import * as subsonic from '../../api/subsonic';
import type { Album, Playlist, Song } from '../../api/types';

vi.mock('../CoverArt', () => ({ CoverArt: () => null }));
vi.mock('../StockCovers', () => ({ WrappedCover: () => null, PlaylistCover: () => null }));
vi.mock('../AlbumCard', () => ({
  AlbumCard: ({ album }: { album: Album }) => <div data-testid="album">{album.name}</div>,
}));
vi.mock('../PlaylistCard', () => ({
  PlaylistCard: ({ pl, onDelete }: { pl: Playlist; onDelete: () => void }) => (
    <div data-testid="playlist">
      {pl.name}
      <button onClick={onDelete}>{`delete ${pl.name}`}</button>
    </div>
  ),
}));

class NoopResizeObserver { observe() {} disconnect() {} }

const song = (id: string, extra: Partial<Song> = {}) =>
  ({ id, title: `Song ${id}`, artist: 'Artist', album: 'Album', albumId: 'al1', ...extra }) as Song;

const playQueue = vi.fn();
const playSong = vi.fn();

// "renders nothing" must be asserted AFTER the fetched data had a chance to arrive, otherwise the
// check passes vacuously on the initial empty render.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function renderWith(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  playQueue.mockClear();
  playSong.mockClear();
  usePlayerStore.setState({ playQueue, playSong, currentSong: null });
});

describe('HomeTrackCard', () => {
  it('shows title and artist, and plays the song within its queue on click', async () => {
    const queue = [song('a'), song('b')];
    renderWith(<HomeTrackCard song={queue[1]} queue={queue} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Song b')).toBeInTheDocument();
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(playSong).toHaveBeenCalledWith(queue[1], queue);
  });

  it('highlights the title only for the song that is playing', () => {
    usePlayerStore.setState({ currentSong: song('a') });
    const queue = [song('a'), song('b')];
    renderWith(<><HomeTrackCard song={queue[0]} queue={queue} /><HomeTrackCard song={queue[1]} queue={queue} /></>);

    expect(screen.getByText('Song a')).toHaveClass('text-brand');
    expect(screen.getByText('Song b')).not.toHaveClass('text-brand');
  });
});

describe('ContinueListeningSection', () => {
  const last = song('s2', { albumId: 'al9', title: 'Karma Police', artist: 'Radiohead', album: 'OK Computer' });
  const albums = [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }] as Album[];

  beforeEach(() => {
    vi.spyOn(subsonic, 'getLastPlayed').mockResolvedValue(last as never);
    vi.spyOn(subsonic, 'getAlbumList').mockResolvedValue(albums);
    vi.spyOn(subsonic, 'getAlbum').mockResolvedValue({
      id: 'al9', song: [song('s1'), song('s2'), song('s3')],
    } as never);
  });

  it('shows the last played track and recently added albums', async () => {
    renderWith(<ContinueListeningSection />);

    expect(await screen.findByText('Karma Police')).toBeInTheDocument();
    expect(screen.getByText('Radiohead · OK Computer')).toBeInTheDocument();
    expect(await screen.findAllByTestId('album')).toHaveLength(2);
    expect(subsonic.getAlbumList).toHaveBeenCalledWith('newest', { size: 12 });
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/albums');
  });

  it('"Jump back in" resumes the album at the last played track', async () => {
    renderWith(<ContinueListeningSection />);

    await userEvent.click(await screen.findByRole('button', { name: /Karma Police/ }));

    await waitFor(() => expect(playQueue).toHaveBeenCalledTimes(1));
    expect(subsonic.getAlbum).toHaveBeenCalledWith('al9');
    expect(playQueue.mock.calls[0][0].map((s: Song) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(playQueue.mock.calls[0][1]).toBe(1);
  });

  it('starts from the first track when the last played one is no longer on the album', async () => {
    vi.spyOn(subsonic, 'getAlbum').mockResolvedValue({ id: 'al9', song: [song('x'), song('y')] } as never);
    renderWith(<ContinueListeningSection />);

    await userEvent.click(await screen.findByRole('button', { name: /Karma Police/ }));

    await waitFor(() => expect(playQueue).toHaveBeenCalled());
    expect(playQueue.mock.calls[0][1]).toBe(0);
  });

  it('does nothing if the album lookup fails', async () => {
    vi.spyOn(subsonic, 'getAlbum').mockRejectedValue(new Error('offline'));
    renderWith(<ContinueListeningSection />);

    await userEvent.click(await screen.findByRole('button', { name: /Karma Police/ }));

    await waitFor(() => expect(subsonic.getAlbum).toHaveBeenCalled());
    expect(playQueue).not.toHaveBeenCalled();
  });

  it('shows only the albums when there is nothing to resume', async () => {
    vi.spyOn(subsonic, 'getLastPlayed').mockResolvedValue(undefined as never);
    renderWith(<ContinueListeningSection />);

    expect(await screen.findAllByTestId('album')).toHaveLength(2);
    expect(screen.queryByText('Jump back in')).not.toBeInTheDocument();
  });

  it('renders nothing at all for a brand-new library', async () => {
    vi.spyOn(subsonic, 'getLastPlayed').mockResolvedValue(undefined as never);
    vi.spyOn(subsonic, 'getAlbumList').mockResolvedValue([]);
    const { container } = renderWith(<ContinueListeningSection />);

    await waitFor(() => expect(subsonic.getAlbumList).toHaveBeenCalled());
    await settle();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MostPlayedSection', () => {
  const pl = (id: string, name: string) => ({ id, name }) as Playlist;

  beforeEach(() => {
    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue(Array.from({ length: 12 }, (_, i) => song(`m${i}`)));
    vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([pl('1', 'Chill')]);
    vi.spyOn(subsonic, 'deletePlaylist').mockResolvedValue(undefined as never);
  });

  it('shows at most the ten top songs, linking to the full list', async () => {
    renderWith(<MostPlayedSection />);

    expect(await screen.findByText('Song m0')).toBeInTheDocument();
    expect(screen.getByText('Song m9')).toBeInTheDocument();
    expect(screen.queryByText('Song m10')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'See all' }).map((a) => a.getAttribute('href'))).toEqual([
      '/most-played', '/playlists',
    ]);
  });

  it('plays a card within the capped list, not the full one', async () => {
    renderWith(<MostPlayedSection />);

    await userEvent.click(await screen.findByRole('button', { name: /Song m3/ }));

    expect(playSong.mock.calls[0][0].id).toBe('m3');
    expect(playSong.mock.calls[0][1]).toHaveLength(10);
  });

  it('lists playlists and deletes one through its card', async () => {
    renderWith(<MostPlayedSection />);

    await userEvent.click(await screen.findByRole('button', { name: 'delete Chill' }));

    await waitFor(() => expect(subsonic.deletePlaylist).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(subsonic.getPlaylists).toHaveBeenCalledTimes(2));
  });

  it('shows only playlists when there is no play history, and only songs without playlists', async () => {
    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue([]);
    const { unmount } = renderWith(<MostPlayedSection />);
    expect(await screen.findByText('Your playlists')).toBeInTheDocument();
    expect(screen.queryByText('Your most played')).not.toBeInTheDocument();
    unmount();

    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue([song('m0')]);
    vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([]);
    renderWith(<MostPlayedSection />);
    expect(await screen.findByText('Your most played')).toBeInTheDocument();
    expect(screen.queryByText('Your playlists')).not.toBeInTheDocument();
  });

  it('renders nothing when there is neither history nor a playlist', async () => {
    vi.spyOn(subsonic, 'getMostPlayed').mockResolvedValue([]);
    vi.spyOn(subsonic, 'getPlaylists').mockResolvedValue([]);
    const { container } = renderWith(<MostPlayedSection />);

    await waitFor(() => expect(subsonic.getPlaylists).toHaveBeenCalled());
    await settle();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RediscoverSection', () => {
  it('lists the suggested songs and links to All Songs', async () => {
    vi.spyOn(subsonic, 'getRediscover').mockResolvedValue([song('r1'), song('r2')]);
    renderWith(<RediscoverSection />);

    expect(await screen.findByText('Song r1')).toBeInTheDocument();
    expect(screen.getByText('Song r2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/songs');
  });

  it('renders nothing when there is nothing to rediscover', async () => {
    vi.spyOn(subsonic, 'getRediscover').mockResolvedValue([]);
    const { container } = renderWith(<RediscoverSection />);

    await waitFor(() => expect(subsonic.getRediscover).toHaveBeenCalled());
    await settle();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WrappedPreviewSection', () => {
  const year = new Date().getFullYear();
  const stats = (extra = {}) => ({
    year, totalPlays: 2500, totalMinutes: 5430, topTracks: [], topAlbums: [], byMonth: [],
    topArtists: [{ id: 'a1', name: 'Radiohead', coverArt: null, playCount: 90 }], ...extra,
  });

  it('teases this year\'s Wrapped with the top artist and totals, linking to /wrapped', async () => {
    vi.spyOn(subsonic, 'getWrapped').mockResolvedValue(stats() as never);
    renderWith(<WrappedPreviewSection />);

    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/wrapped');
    expect(link).toHaveTextContent(`Your ${year} Wrapped`);
    expect(link).toHaveTextContent('Radiohead was your top artist');
    expect(link).toHaveTextContent(`${(2500).toLocaleString()} plays · ${(91).toLocaleString()} hrs`);
    expect(subsonic.getWrapped).toHaveBeenCalledWith(year);
  });

  it('falls back to the play count when there is no top artist', async () => {
    vi.spyOn(subsonic, 'getWrapped').mockResolvedValue(stats({ topArtists: [] }) as never);
    renderWith(<WrappedPreviewSection />);

    expect(await screen.findByText('2500 plays so far')).toBeInTheDocument();
  });

  it('is hidden when there are no plays this year', async () => {
    vi.spyOn(subsonic, 'getWrapped').mockResolvedValue(stats({ totalPlays: 0 }) as never);
    const { container } = renderWith(<WrappedPreviewSection />);

    await waitFor(() => expect(subsonic.getWrapped).toHaveBeenCalled());
    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden when the request fails', async () => {
    vi.spyOn(subsonic, 'getWrapped').mockRejectedValue(new Error('404'));
    const { container } = renderWith(<WrappedPreviewSection />);

    await waitFor(() => expect(subsonic.getWrapped).toHaveBeenCalled());
    await settle();
    expect(container).toBeEmptyDOMElement();
  });
});
