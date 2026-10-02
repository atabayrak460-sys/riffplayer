import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePanelSizesStore, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT,
  NOW_PLAYING_MIN, NOW_PLAYING_MAX, NOW_PLAYING_DEFAULT,
} from './panelSizes';

beforeEach(() => {
  usePanelSizesStore.setState({ sidebarWidth: SIDEBAR_DEFAULT, nowPlayingWidth: NOW_PLAYING_DEFAULT });
});

describe('usePanelSizesStore', () => {
  it('starts at the documented defaults', () => {
    const s = usePanelSizesStore.getState();
    expect(s.sidebarWidth).toBe(SIDEBAR_DEFAULT);
    expect(s.nowPlayingWidth).toBe(NOW_PLAYING_DEFAULT);
  });

  it('sets the sidebar width within range', () => {
    usePanelSizesStore.getState().setSidebarWidth(300);
    expect(usePanelSizesStore.getState().sidebarWidth).toBe(300);
  });

  it('clamps the sidebar width to [SIDEBAR_MIN, SIDEBAR_MAX]', () => {
    usePanelSizesStore.getState().setSidebarWidth(SIDEBAR_MIN - 50);
    expect(usePanelSizesStore.getState().sidebarWidth).toBe(SIDEBAR_MIN);

    usePanelSizesStore.getState().setSidebarWidth(SIDEBAR_MAX + 50);
    expect(usePanelSizesStore.getState().sidebarWidth).toBe(SIDEBAR_MAX);
  });

  it('clamps the now-playing panel width to [NOW_PLAYING_MIN, NOW_PLAYING_MAX]', () => {
    usePanelSizesStore.getState().setNowPlayingWidth(NOW_PLAYING_MIN - 50);
    expect(usePanelSizesStore.getState().nowPlayingWidth).toBe(NOW_PLAYING_MIN);

    usePanelSizesStore.getState().setNowPlayingWidth(NOW_PLAYING_MAX + 50);
    expect(usePanelSizesStore.getState().nowPlayingWidth).toBe(NOW_PLAYING_MAX);
  });

  it('the two panels have independent ranges', () => {
    // Sanity guard against a copy-paste mix-up between the two constants —
    // if these ever end up equal, clamping one would silently also be
    // "correct" for the other, hiding a real bug.
    expect(SIDEBAR_MIN).not.toBe(NOW_PLAYING_MIN);
    expect(SIDEBAR_MAX).not.toBe(NOW_PLAYING_MAX);
  });
});
