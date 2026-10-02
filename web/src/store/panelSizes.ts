import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Chosen so each panel always has enough room for its own content without
// either swallowing the whole window or shrinking to the point of
// clipping text/controls — not tied to any particular screen size.
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 240;

export const NOW_PLAYING_MIN = 260;
export const NOW_PLAYING_MAX = 440;
export const NOW_PLAYING_DEFAULT = 320;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface PanelSizesState {
  sidebarWidth: number;
  nowPlayingWidth: number;
  setSidebarWidth: (w: number) => void;
  setNowPlayingWidth: (w: number) => void;
}

/** User-resizable widths for the left sidebar and right "Now Playing" panel,
 * persisted across sessions like any other layout preference. */
export const usePanelSizesStore = create<PanelSizesState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT,
      nowPlayingWidth: NOW_PLAYING_DEFAULT,
      setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_MIN, SIDEBAR_MAX) }),
      setNowPlayingWidth: (w) => set({ nowPlayingWidth: clamp(w, NOW_PLAYING_MIN, NOW_PLAYING_MAX) }),
    }),
    { name: 'cadence-panel-sizes' },
  ),
);
