// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { usePlayerStore } from '../store/player';
import { useUiMenuStore } from '../store/uiMenu';

function fireArrowUp() {
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
}

describe('useGlobalShortcuts', () => {
  beforeEach(() => {
    useUiMenuStore.setState({ activeMenuId: null });
  });

  it('adjusts volume on ArrowUp when no menu is open', () => {
    const setVolume = vi.fn();
    usePlayerStore.setState({ volume: 0.5, setVolume });
    renderHook(() => useGlobalShortcuts(vi.fn()));

    fireArrowUp();

    expect(setVolume).toHaveBeenCalledOnce();
  });

  it('does not change volume on ArrowUp while a context/options menu is open', () => {
    // ContextMenu.tsx owns ArrowUp/Down on document for its own item
    // navigation while a menu is open — the global playback shortcut must
    // not also fire and change volume at the same time.
    const setVolume = vi.fn();
    usePlayerStore.setState({ volume: 0.5, setVolume });
    useUiMenuStore.getState().openMenu('menu-1');
    renderHook(() => useGlobalShortcuts(vi.fn()));

    fireArrowUp();

    expect(setVolume).not.toHaveBeenCalled();
  });
});
