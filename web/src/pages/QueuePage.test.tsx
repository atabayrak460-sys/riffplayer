// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuePage } from './QueuePage';
import { usePlayerStore } from '../store/player';
import type { Song } from '../api/types';

vi.mock('../components/CoverArt', () => ({ CoverArt: () => null }));

const song = (id: string, extra: Partial<Song> = {}): Song =>
  ({ id, title: `Song ${id}`, artist: `Artist ${id}`, ...extra }) as Song;

const reorderQueue = vi.fn();
const removeFromQueue = vi.fn();
const clearQueue = vi.fn();
const playQueue = vi.fn();

function setQueue(queue: Song[], queueIndex = 0) {
  usePlayerStore.setState({ queue, queueIndex, reorderQueue, removeFromQueue, clearQueue, playQueue });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('QueuePage', () => {
  it('shows an empty-state message and no "Clear all" when the queue is empty', () => {
    setQueue([]);
    render(<QueuePage />);

    expect(screen.getByText(/the queue is empty/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
  });

  it('lists every queued song with its artist', () => {
    setQueue([song('a'), song('b')]);
    render(<QueuePage />);

    expect(screen.getByText('Song a')).toBeInTheDocument();
    expect(screen.getByText('Artist b')).toBeInTheDocument();
  });

  it('formats durations as m:ss and shows none when unknown', () => {
    setQueue([song('a', { duration: 65 }), song('b', { duration: 600 }), song('c')]);
    render(<QueuePage />);

    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('highlights only the current track', () => {
    setQueue([song('a'), song('b')], 1);
    render(<QueuePage />);

    expect(screen.getByText('Song b')).toHaveClass('text-brand');
    expect(screen.getByText('Song a')).not.toHaveClass('text-brand');
  });

  it('renders the same song twice when it is queued twice', () => {
    setQueue([song('a'), song('a')]);
    render(<QueuePage />);

    expect(screen.getAllByText('Song a')).toHaveLength(2);
  });

  it('removes by position, so a duplicate removes only the clicked copy', async () => {
    setQueue([song('a'), song('b'), song('a')]);
    render(<QueuePage />);

    const rows = screen.getAllByTitle('Remove');
    await userEvent.click(rows[2]);

    expect(removeFromQueue).toHaveBeenCalledTimes(1);
    expect(removeFromQueue).toHaveBeenCalledWith(2);
  });

  it('plays from the double-clicked position with the whole queue', async () => {
    const queue = [song('a'), song('b'), song('c')];
    setQueue(queue);
    render(<QueuePage />);

    await userEvent.dblClick(screen.getByText('Song c'));

    expect(playQueue).toHaveBeenCalledWith(queue, 2);
  });

  it('a single click does not start playback', async () => {
    setQueue([song('a'), song('b')]);
    render(<QueuePage />);

    await userEvent.click(screen.getByText('Song b'));

    expect(playQueue).not.toHaveBeenCalled();
  });

  it('"Clear all" clears the queue', async () => {
    setQueue([song('a')]);
    render(<QueuePage />);

    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));

    expect(clearQueue).toHaveBeenCalledTimes(1);
  });

  it('gives each row a drag handle', () => {
    setQueue([song('a'), song('b')]);
    render(<QueuePage />);

    expect(within(document.body).getAllByTitle('Drag to reorder')).toHaveLength(2);
  });
});
