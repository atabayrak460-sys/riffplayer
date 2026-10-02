// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UpNextSection } from './UpNextSection';
import { usePlayerStore } from '../../store/player';
import type { Song } from '../../api/types';

function makeSong(id: string, title: string): Song {
  return {
    id, title, album: 'Album', albumId: 'al-1', artist: 'Artist', artistId: 'ar-1',
    created: '2024-01-01', isVideo: false, type: 'music', suffix: 'mp3', duration: 200,
  };
}

function renderSection() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UpNextSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const queue = Array.from({ length: 6 }, (_, i) => makeSong(`t-${i}`, `Track ${i}`));

beforeEach(() => {
  usePlayerStore.setState({ queue: [], queueIndex: -1 });
});

describe('UpNextSection', () => {
  it('renders nothing when there is no upcoming track', () => {
    usePlayerStore.setState({ queue, queueIndex: queue.length - 1 });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every remaining queued track, not just the immediate next one', () => {
    // Regression: this used to show only queue[queueIndex + 1] and nothing
    // past it, even with several more tracks queued up.
    usePlayerStore.setState({ queue, queueIndex: 0 });
    renderSection();

    expect(screen.getByText('Up next')).toBeInTheDocument();
    for (let i = 1; i < queue.length; i++) {
      expect(screen.getByText(`Track ${i}`)).toBeInTheDocument();
    }
  });

  it('does not include the currently playing track or earlier ones', () => {
    usePlayerStore.setState({ queue, queueIndex: 3 });
    renderSection();

    expect(screen.queryByText('Track 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Track 3')).not.toBeInTheDocument();
    expect(screen.getByText('Track 4')).toBeInTheDocument();
    expect(screen.getByText('Track 5')).toBeInTheDocument();
  });
});
