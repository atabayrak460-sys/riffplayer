// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerBar } from './PlayerBar';
import { usePlayerStore } from '../store/player';
import * as subsonic from '../api/subsonic';
import type { Song } from '../api/types';

const song: Song = {
  id: 't-1', title: 'Test Song', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1',
  created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3', duration: 200,
};

function renderBar() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PlayerBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// jsdom doesn't evaluate CSS (including Tailwind's md: responsive
// variants), so the desktop bar and the mobile compact bar are both
// present in the DOM at once in every test — every query here is scoped
// to the mobile-only containers via their data-testid to avoid matching
// the (also rendered, just CSS-hidden) desktop bar's identical content.

beforeEach(() => {
  usePlayerStore.setState({ currentSong: null, playing: false, currentTime: 0, duration: 0, queue: [], queueIndex: -1 });
});

describe('PlayerBar', () => {
  it('shows "No track playing" when nothing is loaded', () => {
    renderBar();
    expect(screen.getByText('No track playing')).toBeInTheDocument();
  });

  describe('mobile compact bar', () => {
    beforeEach(() => {
      usePlayerStore.setState({ currentSong: song, playing: false, currentTime: 50, duration: 200 });
    });

    function compactBar() {
      return within(screen.getByTestId('mobile-compact-bar'));
    }

    it('shows the current song and play/next controls', () => {
      renderBar();
      const bar = compactBar();
      expect(bar.getByText('Test Song')).toBeInTheDocument();
      expect(bar.getByText('Test Artist')).toBeInTheDocument();
      expect(bar.getByTitle('Play')).toBeInTheDocument();
      expect(bar.getByTitle('Next')).toBeInTheDocument();
    });

    it('toggling play does not expand the sheet', () => {
      const togglePlay = vi.fn();
      usePlayerStore.setState({ togglePlay });
      renderBar();

      fireEvent.click(compactBar().getByTitle('Play'));

      expect(togglePlay).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('mobile-expanded-sheet')).not.toBeInTheDocument();
    });

    it('tapping the song info expands the full-controls sheet', () => {
      renderBar();
      fireEvent.click(compactBar().getByText('Test Song'));

      const sheet = within(screen.getByTestId('mobile-expanded-sheet'));
      expect(sheet.getByText('Queue')).toBeInTheDocument();
      expect(sheet.getByText('Lyrics')).toBeInTheDocument();
      // Unlike the old mobile-only sheet, this now also opens on desktop
      // (no hardware volume keys there), so it needs its own volume control.
      expect(sheet.getByRole('slider', { name: /volume/i })).toBeInTheDocument();
    });

    it('the expanded player closes via its close button', () => {
      // Full-screen now — no backdrop left to click away to, so this is the
      // primary way out (see the next test for the Escape-key alternative).
      renderBar();
      fireEvent.click(compactBar().getByText('Test Song'));
      const sheet = within(screen.getByTestId('mobile-expanded-sheet'));

      fireEvent.click(sheet.getByTitle('Close'));

      expect(screen.queryByTestId('mobile-expanded-sheet')).not.toBeInTheDocument();
    });

    it('the expanded player closes on Escape', () => {
      renderBar();
      fireEvent.click(compactBar().getByText('Test Song'));
      expect(screen.getByTestId('mobile-expanded-sheet')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('mobile-expanded-sheet')).not.toBeInTheDocument();
    });

    it('the expanded sheet has a "More options" menu beyond just favoriting', () => {
      renderBar();
      fireEvent.click(compactBar().getByText('Test Song'));
      const sheet = within(screen.getByTestId('mobile-expanded-sheet'));

      fireEvent.click(sheet.getByTitle('More options'));

      expect(screen.getByText('Add to playlist')).toBeInTheDocument();
      expect(screen.getByText('Add to queue')).toBeInTheDocument();
      expect(screen.getByText('Go to album')).toBeInTheDocument();
      expect(screen.getByText('Go to artist')).toBeInTheDocument();
      expect(screen.getByText('Song info')).toBeInTheDocument();
    });
  });

  describe('desktop bar', () => {
    beforeEach(() => {
      usePlayerStore.setState({ currentSong: song, playing: false, currentTime: 50, duration: 200 });
    });

    it('has a "More options" menu next to the favorite button', () => {
      renderBar();

      fireEvent.click(screen.getByTitle('More options'));

      expect(screen.getByText('Add to playlist')).toBeInTheDocument();
      expect(screen.getByText('Download')).toBeInTheDocument();
    });
  });

  describe('expanded player (cover carousel)', () => {
    const prevSong: Song = { ...song, id: 't-0', title: 'Prev Song', artist: 'Prev Artist' };
    const nextSong: Song = { ...song, id: 't-2', title: 'Next Song', artist: 'Next Artist' };

    function openFromDesktopCover() {
      renderBar();
      fireEvent.click(screen.getByTitle('Expand'));
      return within(screen.getByTestId('mobile-expanded-sheet'));
    }

    it('opens when the desktop bar cover art is clicked', () => {
      usePlayerStore.setState({ currentSong: song, queue: [song], queueIndex: 0 });
      renderBar();
      expect(screen.queryByTestId('mobile-expanded-sheet')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTitle('Expand'));

      expect(screen.getByTestId('mobile-expanded-sheet')).toBeInTheDocument();
    });

    it('shows a clickable peek of the next queued track that skips to it', () => {
      const next = vi.fn();
      usePlayerStore.setState({ currentSong: song, queue: [song, nextSong], queueIndex: 0, next });
      const sheet = openFromDesktopCover();

      fireEvent.click(sheet.getByTitle(`Next: ${nextSong.title}`));

      expect(next).toHaveBeenCalledOnce();
    });

    it('shows a clickable peek of the previous queued track that skips back to it', () => {
      const prev = vi.fn();
      usePlayerStore.setState({ currentSong: song, queue: [prevSong, song], queueIndex: 1, prev });
      const sheet = openFromDesktopCover();

      fireEvent.click(sheet.getByTitle(`Previous: ${prevSong.title}`));

      expect(prev).toHaveBeenCalledOnce();
    });

    it('shows no peek when there is nothing before/after the current track in the queue', () => {
      usePlayerStore.setState({ currentSong: song, queue: [song], queueIndex: 0 });
      const sheet = openFromDesktopCover();

      expect(sheet.queryByTitle(/^Next:/)).not.toBeInTheDocument();
      expect(sheet.queryByTitle(/^Previous:/)).not.toBeInTheDocument();
    });

    it('toggling Lyrics swaps the cover carousel for an embedded lyrics view', async () => {
      vi.spyOn(subsonic, 'getLyrics').mockResolvedValue(null);
      usePlayerStore.setState({ currentSong: song, queue: [song], queueIndex: 0 });
      const sheet = openFromDesktopCover();
      // Cover view's title is a clickable link to the album — the lyrics
      // view's header shows the same text as plain (non-link) text instead.
      expect(sheet.getByRole('link', { name: song.title })).toBeInTheDocument();

      fireEvent.click(sheet.getByText('Lyrics'));

      expect(sheet.queryByRole('link', { name: song.title })).not.toBeInTheDocument();
      expect(await sheet.findByText('No lyrics found for this track.')).toBeInTheDocument();
      // The embedded lyrics view has no close button of its own — only the
      // sheet's own top-right close button and the Lyrics toggle apply here.
      expect(sheet.getAllByTitle('Close')).toHaveLength(1);
    });
  });
});
