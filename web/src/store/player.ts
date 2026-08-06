import { create } from 'zustand';
import { scrobble, streamUrl } from '../api/subsonic';
import { useDownloadsStore } from './downloads';
import { getTrackAudioBlob } from '../lib/offlineDb';
import type { Song } from '../api/types';

// Singleton Audio element — lives outside React's render cycle
const audio = new Audio();
audio.preload = 'metadata';

// Tracks the blob: URL currently assigned to `audio.src` (if any) so it can be
// revoked when playback moves to a different track — object URLs otherwise leak.
let currentObjectUrl: string | null = null;

// Incremented on every loadAndPlay() call. resolvePlaybackUrl() has variable
// latency (IndexedDB lookup for a downloaded track vs. near-synchronous for a
// streamed one), so a rapid skip can let an older, slower call resolve after
// a newer one already took over — checking this after the await lets a
// superseded call detect that and bail out instead of reverting audio.src.
let loadGeneration = 0;

// Detaches the scrobble-threshold `timeupdate` listener installed by the
// most recent loadAndPlay() call that actually started playback, if it
// hasn't fired yet. Replaced (never left dangling) on every track change —
// otherwise a listener from a track skipped before its threshold stays
// attached to the singleton audio element forever, and can later fire
// scrobble() against whatever unrelated track happens to be playing then.
let removeScrobbleListener: (() => void) | null = null;

// Volume to restore on unmute — set right before setVolume(0) in toggleMute(),
// so a manual drag to 0 on the slider doesn't count as "muted" with nothing
// to restore to.
let volumeBeforeMute: number | null = null;

/** Prefer a locally downloaded copy so offline-played tracks need no network. */
async function resolvePlaybackUrl(song: Song): Promise<string> {
  if (useDownloadsStore.getState().trackState(song.id) === 'downloaded') {
    const local = await getTrackAudioBlob(song.id);
    if (local) return URL.createObjectURL(local.blob);
  }
  return streamUrl(song.id);
}

/** Fisher-Yates shuffle — returns a new array, does not mutate the input. */
function shuffleArray<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffles `songs`, pinning the song at `keepIndex` to the front so it keeps playing. */
function buildShuffledQueue(songs: Song[], keepIndex: number): Song[] {
  if (!songs.length) return songs;
  const keep = songs[keepIndex] ?? songs[0];
  const rest = songs.filter((_, i) => i !== (keepIndex === -1 ? 0 : keepIndex));
  return [keep, ...shuffleArray(rest)];
}

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  queue: Song[];
  queueIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  // Pre-shuffle order of the current queue, so shuffle can be turned off cleanly. Null when shuffle is off.
  originalQueue: Song[] | null;

  // Derived
  currentSong: Song | null;

  // Actions
  playSong: (song: Song, queue?: Song[]) => void;
  playQueue: (songs: Song[], index?: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  playNext: (song: Song) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
}

export const usePlayerStore = create<PlayerState>()((set, get) => {
  // Sync audio events back into store
  audio.addEventListener('timeupdate', () => {
    set({ currentTime: audio.currentTime });
  });
  audio.addEventListener('durationchange', () => {
    set({ duration: audio.duration || 0 });
  });
  audio.addEventListener('ended', () => {
    const { repeatMode, currentSong } = get();
    if (repeatMode === 'one' && currentSong) {
      audio.currentTime = 0;
      audio.play().catch(() => {/* autoplay policy */});
      return;
    }
    get().next();
  });
  audio.addEventListener('play', () => set({ playing: true }));
  audio.addEventListener('pause', () => set({ playing: false }));

  async function loadAndPlay(song: Song): Promise<void> {
    const generation = ++loadGeneration;
    const url = await resolvePlaybackUrl(song);
    if (generation !== loadGeneration) return; // a newer loadAndPlay() call already took over

    if (audio.src !== url) {
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
      audio.src = url;
      if (url.startsWith('blob:')) currentObjectUrl = url;
      audio.load();
    }

    // Apply ReplayGain track gain: convert dB → linear and scale user volume
    const { volume: userVol } = get();
    if (song.replayGainTrackGain != null) {
      const gain = Math.pow(10, song.replayGainTrackGain / 20);
      audio.volume = Math.min(1, Math.max(0, userVol * gain));
    } else {
      audio.volume = userVol;
    }

    audio.play().catch(() => {/* autoplay policy */});
    scrobble(song.id, false).catch(() => {/* best-effort */});

    // Scrobble submission after 30 s or 50% played (whichever first). Replace
    // any listener left over from a track skipped before its own threshold
    // fired, so at most one is ever attached and it always matches this track.
    removeScrobbleListener?.();
    let scrobbled = false;
    const onTime = () => {
      if (!scrobbled && audio.currentTime >= Math.min(30, (audio.duration || 60) * 0.5)) {
        scrobbled = true;
        scrobble(song.id, true).catch(() => {});
        audio.removeEventListener('timeupdate', onTime);
        removeScrobbleListener = null;
      }
    };
    audio.addEventListener('timeupdate', onTime);
    removeScrobbleListener = () => audio.removeEventListener('timeupdate', onTime);

    // Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album,
      });
    }
  }

  return {
    queue: [],
    queueIndex: -1,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    repeatMode: 'off',
    shuffle: false,
    originalQueue: null,
    currentSong: null,

    playSong: (song, queue) => {
      const q = queue ?? [song];
      const idx = queue ? queue.findIndex((s) => s.id === song.id) : 0;
      // Manually picking a track always drops repeat-one — it only survives the track's own natural loop.
      const repeatMode = get().repeatMode === 'one' ? 'off' : get().repeatMode;
      if (get().shuffle) {
        const shuffled = buildShuffledQueue(q, idx);
        set({ queue: shuffled, queueIndex: 0, currentSong: song, originalQueue: q, repeatMode });
      } else {
        set({ queue: q, queueIndex: idx, currentSong: song, originalQueue: null, repeatMode });
      }
      loadAndPlay(song);
    },

    playQueue: (songs, index = 0) => {
      if (!songs.length) return;
      const song = songs[index];
      const repeatMode = get().repeatMode === 'one' ? 'off' : get().repeatMode;
      if (get().shuffle) {
        const shuffled = buildShuffledQueue(songs, index);
        set({ queue: shuffled, queueIndex: 0, currentSong: song, originalQueue: songs, repeatMode });
      } else {
        set({ queue: songs, queueIndex: index, currentSong: song, originalQueue: null, repeatMode });
      }
      loadAndPlay(song);
    },

    togglePlay: () => {
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    },

    next: () => {
      const { queue, queueIndex, shuffle } = get();
      if (!queue.length) return;
      // A manual skip always drops repeat-one — it only survives the track's own natural loop
      // (which never reaches here — see the `ended` listener above).
      if (get().repeatMode === 'one') set({ repeatMode: 'off' });
      const repeatMode = get().repeatMode;
      let next = queueIndex + 1;
      if (next >= queue.length) {
        if (repeatMode !== 'all') {
          audio.pause();
          set({ playing: false, currentTime: 0 });
          return;
        }
        // Looping back to the start of a shuffled queue — reshuffle for the new lap.
        if (shuffle) {
          const reshuffled = shuffleArray(queue);
          const song = reshuffled[0];
          set({ queue: reshuffled, queueIndex: 0, currentSong: song });
          loadAndPlay(song);
          return;
        }
        next = 0;
      }
      const song = queue[next];
      set({ queueIndex: next, currentSong: song });
      loadAndPlay(song);
    },

    prev: () => {
      const { queue, queueIndex, currentTime } = get();
      // A manual skip always drops repeat-one — it only survives the track's own natural loop.
      if (get().repeatMode === 'one') set({ repeatMode: 'off' });
      if (currentTime > 3) {
        audio.currentTime = 0;
        return;
      }
      const prev = queueIndex - 1;
      if (prev < 0) { audio.currentTime = 0; return; }
      const song = queue[prev];
      set({ queueIndex: prev, currentSong: song });
      loadAndPlay(song);
    },

    seek: (seconds) => {
      audio.currentTime = seconds;
      set({ currentTime: seconds });
    },

    setVolume: (v) => {
      audio.volume = v;
      set({ volume: v });
    },

    toggleMute: () => {
      const { volume } = get();
      if (volume > 0) {
        volumeBeforeMute = volume;
        audio.volume = 0;
        set({ volume: 0 });
      } else {
        const restored = volumeBeforeMute ?? 1;
        volumeBeforeMute = null;
        audio.volume = restored;
        set({ volume: restored });
      }
    },

    playNext: (song) => {
      set((s) => {
        const insertAt = s.queueIndex + 1;
        const queue = [...s.queue.slice(0, insertAt), song, ...s.queue.slice(insertAt)];
        const originalQueue = s.originalQueue ? [...s.originalQueue, song] : s.originalQueue;
        return { queue, originalQueue };
      });
    },

    addToQueue: (song) => {
      set((s) => ({
        queue: [...s.queue, song],
        originalQueue: s.originalQueue ? [...s.originalQueue, song] : s.originalQueue,
      }));
    },

    removeFromQueue: (index) => {
      set((s) => {
        const removedSong = s.queue[index];
        const queue = s.queue.filter((_, i) => i !== index);
        let originalQueue = s.originalQueue;
        if (originalQueue && removedSong) {
          const origIdx = originalQueue.findIndex((sg) => sg.id === removedSong.id);
          if (origIdx !== -1) originalQueue = originalQueue.filter((_, i) => i !== origIdx);
        }
        let queueIndex = s.queueIndex;
        if (index < queueIndex) queueIndex--;
        else if (index === queueIndex) {
          // Stop if the current song is removed
          audio.pause();
          return { queue, queueIndex: -1, currentSong: null, playing: false, originalQueue };
        }
        return { queue, queueIndex, originalQueue };
      });
    },

    reorderQueue: (from, to) => {
      set((s) => {
        const queue = [...s.queue];
        const [moved] = queue.splice(from, 1);
        queue.splice(to, 0, moved);
        let queueIndex = s.queueIndex;
        if (from === queueIndex) {
          queueIndex = to;
        } else if (from < queueIndex && to >= queueIndex) {
          queueIndex--;
        } else if (from > queueIndex && to <= queueIndex) {
          queueIndex++;
        }
        return { queue, queueIndex };
      });
    },

    clearQueue: () => {
      audio.pause();
      set({ queue: [], queueIndex: -1, currentSong: null, playing: false, originalQueue: null });
    },

    toggleRepeat: () => {
      const order: RepeatMode[] = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeatMode) + 1) % order.length];
      set({ repeatMode: next });
    },

    toggleShuffle: () => {
      const { shuffle, queue, queueIndex, originalQueue } = get();
      if (shuffle) {
        // Turning off — restore the pre-shuffle order and resume from the current song.
        const restored = originalQueue ?? queue;
        const current = queue[queueIndex];
        const restoredIndex = current ? restored.findIndex((s) => s.id === current.id) : -1;
        set({ queue: restored, queueIndex: Math.max(restoredIndex, 0), shuffle: false, originalQueue: null });
        return;
      }
      if (!queue.length) {
        set({ shuffle: true });
        return;
      }
      const shuffled = buildShuffledQueue(queue, queueIndex);
      set({ originalQueue: queue, queue: shuffled, queueIndex: 0, shuffle: true });
    },
  };
});

// Wire up Media Session action handlers after store is created
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => usePlayerStore.getState().togglePlay());
  navigator.mediaSession.setActionHandler('pause', () => usePlayerStore.getState().togglePlay());
  navigator.mediaSession.setActionHandler('nexttrack', () => usePlayerStore.getState().next());
  navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().prev());
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    if (d.seekTime != null) usePlayerStore.getState().seek(d.seekTime);
  });
}
