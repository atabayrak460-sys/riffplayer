import { create } from 'zustand';

interface LyricsViewState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

/** Whether the lyrics view is showing. Toggled from the player bar, but the
 * desktop view itself is rendered by Layout over the main content area, so
 * the state lives here rather than in PlayerBar. */
export const useLyricsViewStore = create<LyricsViewState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));
