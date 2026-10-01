// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlayerBar } from './PlayerBar';
import { usePlayerStore } from '../store/player';
import type { Song } from '../api/types';

const song: Song = {
  id: 't-1', title: 'Test Song', album: 'Test Album', albumId: 'al-1', artist: 'Test Artist', artistId: 'ar-1',
  created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3', duration: 200,
};

function renderBar() {
  return render(
    <MemoryRouter>
      <PlayerBar />
    </MemoryRouter>,
  );
}

// jsdom doesn't evaluate CSS (including Tailwind's md: responsive
// variants), so the desktop bar and the mobile compact bar are both
// present in the DOM at once in every test — every query here is scoped
// to the mobile-only containers via their data-testid to avoid matching
// the (also rendered, just CSS-hidden) desktop bar's identical content.

beforeEach(() => {
  usePlayerStore.setState({ currentSong: null, playing: false, currentTime: 0, duration: 0 });
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
      // Sheet-only content: Queue/Lyrics links and no volume slider (#69's
      // mobile decision — hardware keys only).
      expect(sheet.getByText('Queue')).toBeInTheDocument();
      expect(sheet.getByText('Lyrics')).toBeInTheDocument();
      expect(sheet.queryByRole('slider', { name: /volume/i })).not.toBeInTheDocument();
    });

    it('the expanded sheet closes on backdrop click', () => {
      renderBar();
      fireEvent.click(compactBar().getByText('Test Song'));
      const sheet = screen.getByTestId('mobile-expanded-sheet');
      expect(sheet).toBeInTheDocument();

      fireEvent.click(sheet); // the sheet element itself is the backdrop

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
});
