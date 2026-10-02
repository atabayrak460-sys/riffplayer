// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NowPlayingPanel } from './NowPlayingPanel';
import { usePlayerStore } from '../store/player';
import { usePanelSizesStore } from '../store/panelSizes';
import type { Song } from '../api/types';

vi.mock('./ResizeHandle', () => ({
  ResizeHandle: (p: { width: number; direction: number }) => (
    <div data-testid="handle" data-width={p.width} data-direction={p.direction} />
  ),
}));
vi.mock('./nowplaying/HeroSection', () => ({ HeroSection: ({ song }: { song: Song }) => <p>hero:{song.title}</p> }));
vi.mock('./nowplaying/AlbumTracksSection', () => ({ AlbumTracksSection: () => <p>album tracks</p> }));
vi.mock('./nowplaying/ArtistTracksSection', () => ({ ArtistTracksSection: () => <p>artist tracks</p> }));
vi.mock('./nowplaying/UpNextSection', () => ({ UpNextSection: () => <p>up next</p> }));

beforeEach(() => {
  usePlayerStore.setState({ currentSong: null });
  usePanelSizesStore.setState({ nowPlayingWidth: 360 });
});

describe('NowPlayingPanel', () => {
  it('renders nothing while nothing is playing', () => {
    const { container } = render(<NowPlayingPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the four sections for the current song, in order', () => {
    usePlayerStore.setState({ currentSong: { id: 's1', title: 'Karma Police' } as Song });
    const { container } = render(<NowPlayingPanel />);

    const text = Array.from(container.querySelectorAll('aside p')).map((p) => p.textContent);
    expect(text).toEqual(['hero:Karma Police', 'album tracks', 'artist tracks', 'up next']);
  });

  it('is only displayed from the xl breakpoint up', () => {
    usePlayerStore.setState({ currentSong: { id: 's1', title: 'T' } as Song });
    const { container } = render(<NowPlayingPanel />);

    expect(container.firstChild).toHaveClass('hidden', 'xl:flex');
  });

  it('takes its width from the panel-size store', () => {
    usePanelSizesStore.setState({ nowPlayingWidth: 420 });
    usePlayerStore.setState({ currentSong: { id: 's1', title: 'T' } as Song });
    const { container } = render(<NowPlayingPanel />);

    expect(container.querySelector('aside')).toHaveStyle({ width: '420px' });
  });

  it('puts a left-edge resize handle that grows the panel when dragged left', () => {
    usePlayerStore.setState({ currentSong: { id: 's1', title: 'T' } as Song });
    render(<NowPlayingPanel />);

    const handle = screen.getByTestId('handle');
    expect(handle.dataset.direction).toBe('-1');
    expect(handle.dataset.width).toBe('360');
  });
});
