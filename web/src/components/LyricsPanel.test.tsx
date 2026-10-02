// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LyricsPanel } from './LyricsPanel';
import { usePlayerStore } from '../store/player';
import type { Song } from '../api/types';

vi.mock('../api/subsonic', () => ({ getLyrics: vi.fn() }));

const { getLyrics } = await import('../api/subsonic');
const seek = vi.fn();

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LyricsPanel onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  usePlayerStore.setState({
    currentSong: { id: 's1', title: 'Song', artist: 'Artist' } as Song,
    currentTime: 0,
    seek,
  });
});

describe('LyricsPanel', () => {
  it('seeks to a synced line\'s timestamp when it is clicked', async () => {
    vi.mocked(getLyrics).mockResolvedValue({
      synced: true,
      line: [{ start: 0, value: 'First' }, { start: 12_500, value: 'Second' }],
    } as Awaited<ReturnType<typeof getLyrics>>);
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Second' }));
    expect(seek).toHaveBeenCalledWith(12.5);
  });

  it('does not make unsynced lines clickable', async () => {
    vi.mocked(getLyrics).mockResolvedValue({
      synced: false,
      line: [{ start: 0, value: 'Plain line' }],
    } as Awaited<ReturnType<typeof getLyrics>>);
    renderPanel();

    expect(await screen.findByText('Plain line')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plain line' })).toBeNull();
  });
});
