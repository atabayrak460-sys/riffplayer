import { create } from 'zustand';
import { scrobble, streamUrl } from '../api/subsonic';
import type { Song } from '../api/types';

// Singleton Audio element — lives outside React's render cycle
const audio = new Audio();
audio.preload = 'metadata';

interface PlayerState {
  queue: Song[];
  queueIndex: number;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;

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
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
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
    get().next();
  });
  audio.addEventListener('play', () => set({ playing: true }));
  audio.addEventListener('pause', () => set({ playing: false }));

  function loadAndPlay(song: Song): void {
    const url = streamUrl(song.id);
    if (audio.src !== url) {
      audio.src = url;
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

    // Scrobble submission after 30 s or 50% played (whichever first)
    let scrobbled = false;
    const onTime = () => {
      if (!scrobbled && audio.currentTime >= Math.min(30, (audio.duration || 60) * 0.5)) {
        scrobbled = true;
        scrobble(song.id, true).catch(() => {});
        audio.removeEventListener('timeupdate', onTime);
      }
    };
    audio.addEventListener('timeupdate', onTime);

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
    currentSong: null,

    playSong: (song, queue) => {
      const q = queue ?? [song];
      const idx = queue ? queue.findIndex((s) => s.id === song.id) : 0;
      set({ queue: q, queueIndex: idx, currentSong: song });
      loadAndPlay(song);
    },

    playQueue: (songs, index = 0) => {
      if (!songs.length) return;
      const song = songs[index];
      set({ queue: songs, queueIndex: index, currentSong: song });
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
      const { queue, queueIndex } = get();
      const next = queueIndex + 1;
      if (next >= queue.length) {
        audio.pause();
        set({ playing: false, currentTime: 0 });
        return;
      }
      const song = queue[next];
      set({ queueIndex: next, currentSong: song });
      loadAndPlay(song);
    },

    prev: () => {
      const { queue, queueIndex, currentTime } = get();
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

    addToQueue: (song) => {
      set((s) => ({ queue: [...s.queue, song] }));
    },

    removeFromQueue: (index) => {
      set((s) => {
        const queue = s.queue.filter((_, i) => i !== index);
        let queueIndex = s.queueIndex;
        if (index < queueIndex) queueIndex--;
        else if (index === queueIndex) {
          // Stop if the current song is removed
          audio.pause();
          return { queue, queueIndex: -1, currentSong: null, playing: false };
        }
        return { queue, queueIndex };
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
      set({ queue: [], queueIndex: -1, currentSong: null, playing: false });
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
