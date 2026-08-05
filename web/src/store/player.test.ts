import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Song } from '../api/types';

// player.ts creates a singleton `new Audio()` at module load time, which
// doesn't exist in this project's node test environment — stub a minimal
// fake before importing so the module (and its real store logic) loads.
class FakeAudio {
  /** The one instance loadAndPlay() actually talks to — player.ts creates it
   * once at module load, so tests read state through this static reference
   * rather than needing player.ts to export the audio element itself. */
  static instance: FakeAudio;
  preload = '';
  src = '';
  volume = 1;
  paused = true;
  currentTime = 0;
  duration = 0;
  private listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
  constructor() {
    FakeAudio.instance = this;
  }
  addEventListener(type: string, cb: (...a: unknown[]) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: (...a: unknown[]) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== cb);
  }
  /** Fires every listener registered for `type`, e.g. simulating playback
   * crossing the scrobble threshold via a 'timeupdate' event. */
  emit(type: string) {
    for (const l of this.listeners[type] ?? []) l();
  }
  listenerCount(type: string) {
    return (this.listeners[type] ?? []).length;
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
// Only used by the downloaded-track branch of resolvePlaybackUrl(); real
// object-URL creation needs a browser. Extends the real URL (rather than
// replacing the global outright) since other modules in the import graph
// construct real `new URL(...)` instances.
class StubURL extends URL {
  static createObjectURL() {
    return 'blob:fake';
  }
  static revokeObjectURL() {}
}
vi.stubGlobal('URL', StubURL);

// Lets the race-condition tests below control exactly when a "downloaded
// track" lookup resolves (and in what order), independent of call order —
// vi.hoisted() so the map exists before vi.mock()'s factory runs.
const { blobResolvers } = vi.hoisted(() => ({
  blobResolvers: {} as Record<string, (v: { blob: Blob; mimeType: string } | null) => void>,
}));
vi.mock('../lib/offlineDb', () => ({
  getTrackAudioBlob: (id: string) =>
    new Promise((resolve) => {
      blobResolvers[id] = resolve;
    }),
}));
vi.mock('../api/subsonic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/subsonic')>()),
  scrobble: vi.fn().mockResolvedValue(undefined),
}));

const { usePlayerStore } = await import('./player');
const { useDownloadsStore } = await import('./downloads');
const { scrobble } = await import('../api/subsonic');

/** Drains pending microtasks — loadAndPlay() chains two awaits
 * (resolvePlaybackUrl awaiting getTrackAudioBlob) after a blobResolvers[id]
 * call, so a plain `await Promise.resolve()` isn't reliably enough hops. */
const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it('advances normally mid-queue and drops repeat-one to off (manual skip)', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b'), song('c')], queueIndex: 0, repeatMode: 'one' });
    usePlayerStore.getState().next();

    const { queueIndex, currentSong, repeatMode } = usePlayerStore.getState();
    expect(queueIndex).toBe(1);
    expect(currentSong?.id).toBe('b');
    expect(repeatMode).toBe('off');
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

describe('repeat-one manual override (Spotify parity)', () => {
  it('prev() drops repeat-one to off', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 1, currentTime: 0, repeatMode: 'one' });
    usePlayerStore.getState().prev();

    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });

  it('prev() drops repeat-one to off even when just restarting the current track (currentTime > 3s)', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 1, currentTime: 10, repeatMode: 'one' });
    usePlayerStore.getState().prev();

    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });

  it('playSong() with a new queue drops repeat-one to off', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0, repeatMode: 'one' });
    usePlayerStore.getState().playSong(song('c'), [song('a'), song('b'), song('c')]);

    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });

  it('playQueue() drops repeat-one to off', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0, repeatMode: 'one' });
    usePlayerStore.getState().playQueue([song('x'), song('y')], 0);

    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });

  it('leaves repeat "off" and "all" untouched on manual skip', () => {
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0, repeatMode: 'off' });
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().repeatMode).toBe('off');

    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0, repeatMode: 'all' });
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().repeatMode).toBe('all');
  });

  it('the natural end-of-track loop (ended event) does not go through here and repeat-one is untouched by design', () => {
    // toggleRepeat only ever cycles a single enum (off -> all -> one -> off), so
    // "all" and "one" can never be layered together in this store.
    usePlayerStore.getState().toggleRepeat();
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('one');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });
});

describe('loadAndPlay race conditions (#35 / #36)', () => {
  beforeEach(() => {
    useDownloadsStore.setState({ status: { 't:a': 'downloaded', 't:b': 'downloaded' } });
  });

  it('a slower, stale URL resolution does not override a track loaded after it (#36)', async () => {
    const a = song('a');
    const b = song('b');

    usePlayerStore.getState().playSong(a, [a, b]); // starts resolving a's URL
    usePlayerStore.getState().playSong(b, [a, b]); // supersedes it before a resolves

    // Resolve the newer call (b) first, then the stale one (a) — the
    // reverse of call order, simulating a's lookup finishing last.
    blobResolvers['b']({ blob: {} as Blob, mimeType: 'audio/mpeg' });
    await flush();
    expect(FakeAudio.instance.src).toBe('blob:fake'); // b applied

    blobResolvers['a']({ blob: {} as Blob, mimeType: 'audio/mpeg' });
    await flush();
    // a's stale resolution must not have reverted playback
    expect(FakeAudio.instance.src).toBe('blob:fake');
    expect(usePlayerStore.getState().currentSong?.id).toBe('b');
  });

  it('replaces (never stacks) the scrobble-threshold listener when skipped before it fires (#35)', async () => {
    const a = song('a');
    const b = song('b');

    usePlayerStore.getState().playSong(a, [a, b]);
    blobResolvers['a']({ blob: {} as Blob, mimeType: 'audio/mpeg' });
    await flush();
    const afterA = FakeAudio.instance.listenerCount('timeupdate');

    // Skip to b before a's scrobble threshold (30s / 50%) is ever reached.
    usePlayerStore.getState().playSong(b, [a, b]);
    blobResolvers['b']({ blob: {} as Blob, mimeType: 'audio/mpeg' });
    await flush();
    const afterB = FakeAudio.instance.listenerCount('timeupdate');

    // Same count, not +1 — a's stale listener was removed, not left dangling.
    expect(afterB).toBe(afterA);

    // Cross the threshold: only b (the actually-playing track) may scrobble.
    FakeAudio.instance.currentTime = 31;
    FakeAudio.instance.duration = 200;
    FakeAudio.instance.emit('timeupdate');

    expect(scrobble).toHaveBeenCalledWith('b', true);
    expect(scrobble).not.toHaveBeenCalledWith('a', true);
  });
});
