import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Song } from '../api/types';

// player.ts creates a singleton `new Audio()` at module load time, which
// doesn't exist in this project's node test environment — stub a minimal
// fake before importing so the module (and its real store logic) loads.
class FakeAudio {
  preload = '';
  src = '';
  volume = 1;
  paused = true;
  currentTime = 0;
  duration = 0;
  private listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  addEventListener(type: string, cb: (...a: unknown[]) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (...a: unknown[]) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== cb);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
}
vi.stubGlobal('Audio', FakeAudio);

const { usePlayerStore } = await import('./player');

function song(id: string): Song {
  return {
    id, title: `Track ${id}`, album: 'Album', albumId: 'al-1', artist: 'Artist', artistId: 'ar-1',
    created: '2024-01-01', isVideo: false, type: 'music',
  };
}

beforeEach(() => {
  usePlayerStore.setState({
    queue: [],
    queueIndex: -1,
    currentSong: null,
    playing: false,
    repeatMode: 'off',
    shuffle: false,
    originalQueue: null,
  });
});

describe('playNext', () => {
  it('inserts immediately after the currently playing track', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b'), song('c')], queueIndex: 0 });
    usePlayerStore.getState().playNext(song('x'));

    const { queue, queueIndex } = usePlayerStore.getState();
    expect(queue.map((s) => s.id)).toEqual(['a', 'x', 'b', 'c']);
    expect(queueIndex).toBe(0); // the current track's position is unaffected
  });

  it('inserts at the start when nothing is currently playing', () => {
    usePlayerStore.setState({ queue: [], queueIndex: -1 });
    usePlayerStore.getState().playNext(song('x'));

    expect(usePlayerStore.getState().queue.map((s) => s.id)).toEqual(['x']);
  });

  it('appends at the end when the current track is the last in the queue', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 1 });
    usePlayerStore.getState().playNext(song('x'));

    expect(usePlayerStore.getState().queue.map((s) => s.id)).toEqual(['a', 'b', 'x']);
  });

  it('repeated calls stack in most-recent-first order right after the current track', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0 });
    usePlayerStore.getState().playNext(song('x'));
    usePlayerStore.getState().playNext(song('y'));

    expect(usePlayerStore.getState().queue.map((s) => s.id)).toEqual(['a', 'y', 'x', 'b']);
  });
});

describe('addToQueue', () => {
  it('appends to the end regardless of the current position', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0 });
    usePlayerStore.getState().addToQueue(song('z'));

    const { queue, queueIndex } = usePlayerStore.getState();
    expect(queue.map((s) => s.id)).toEqual(['a', 'b', 'z']);
    expect(queueIndex).toBe(0);
  });
});

describe('toggleRepeat', () => {
  it('cycles off -> all -> one -> off', () => {
    expect(usePlayerStore.getState().repeatMode).toBe('off');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('all');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('one');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });
});

describe('next', () => {
  it('stops at the end of the queue when repeat is off', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 1, repeatMode: 'off' });
    usePlayerStore.getState().next();

    const { queueIndex, playing } = usePlayerStore.getState();
    expect(queueIndex).toBe(1);
    expect(playing).toBe(false);
  });

  it('wraps back to the first track when repeat is "all"', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 1, repeatMode: 'all' });
    usePlayerStore.getState().next();

    const { queueIndex, currentSong } = usePlayerStore.getState();
    expect(queueIndex).toBe(0);
    expect(currentSong?.id).toBe('a');
  });

  it('advances normally mid-queue regardless of repeat mode', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b'), song('c')], queueIndex: 0, repeatMode: 'one' });
    usePlayerStore.getState().next();

    const { queueIndex, currentSong } = usePlayerStore.getState();
    expect(queueIndex).toBe(1);
    expect(currentSong?.id).toBe('b');
  });

  it('reshuffles when looping back around with shuffle + repeat-all', () => {
    const queue = [song('a'), song('b'), song('c'), song('d'), song('e')];
    usePlayerStore.setState({ queue, queueIndex: queue.length - 1, repeatMode: 'all', shuffle: true });
    usePlayerStore.getState().next();

    const { queueIndex, queue: newQueue, currentSong } = usePlayerStore.getState();
    expect(queueIndex).toBe(0);
    expect(currentSong?.id).toBe(newQueue[0].id);
    // still the same five songs, just possibly reordered
    expect(newQueue.map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('toggleShuffle', () => {
  it('keeps the currently playing song in place and randomizes the rest', () => {
    const queue = [song('a'), song('b'), song('c'), song('d'), song('e')];
    usePlayerStore.setState({ queue, queueIndex: 2, currentSong: song('c') });
    usePlayerStore.getState().toggleShuffle();

    const { queue: shuffled, queueIndex, shuffle, currentSong } = usePlayerStore.getState();
    expect(shuffle).toBe(true);
    expect(queueIndex).toBe(0);
    expect(shuffled[0].id).toBe('c');
    expect(currentSong?.id).toBe('c');
    expect(shuffled.map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('restores original order and correct position when turned back off', () => {
    const queue = [song('a'), song('b'), song('c'), song('d'), song('e')];
    usePlayerStore.setState({ queue, queueIndex: 2, currentSong: song('c') });
    usePlayerStore.getState().toggleShuffle();
    usePlayerStore.getState().toggleShuffle();

    const { queue: restored, queueIndex, shuffle, originalQueue } = usePlayerStore.getState();
    expect(shuffle).toBe(false);
    expect(originalQueue).toBeNull();
    expect(restored.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(queueIndex).toBe(2);
  });

  it('a new queue started while shuffle is already on is shuffled immediately (works from any view)', () => {
    usePlayerStore.setState({ shuffle: true });
    const songs = [song('x'), song('y'), song('z'), song('w')];
    usePlayerStore.getState().playQueue(songs, 1);

    const { queue, queueIndex, currentSong } = usePlayerStore.getState();
    expect(queueIndex).toBe(0);
    expect(queue[0].id).toBe('y');
    expect(currentSong?.id).toBe('y');
    expect(queue.map((s) => s.id).sort()).toEqual(['w', 'x', 'y', 'z']);
  });
});
