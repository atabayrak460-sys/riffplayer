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
  usePlayerStore.setState({ queue: [], queueIndex: -1, currentSong: null, playing: false });
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
