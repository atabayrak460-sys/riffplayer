import { describe, it, expect, beforeEach } from 'vitest';
import { useUiMenuStore } from './uiMenu';

beforeEach(() => {
  useUiMenuStore.setState({ activeMenuId: null });
});

describe('useUiMenuStore', () => {
  it('starts with no active menu', () => {
    expect(useUiMenuStore.getState().activeMenuId).toBeNull();
  });

  it('opening a menu sets it active', () => {
    useUiMenuStore.getState().openMenu('a');
    expect(useUiMenuStore.getState().activeMenuId).toBe('a');
  });

  it('opening a second menu replaces the first — only one active at a time', () => {
    useUiMenuStore.getState().openMenu('a');
    useUiMenuStore.getState().openMenu('b');
    expect(useUiMenuStore.getState().activeMenuId).toBe('b');
  });

  it('closeMenu(id) only clears if that id is the currently active one', () => {
    useUiMenuStore.getState().openMenu('a');
    useUiMenuStore.getState().closeMenu('b'); // b never opened, should be a no-op
    expect(useUiMenuStore.getState().activeMenuId).toBe('a');

    useUiMenuStore.getState().closeMenu('a');
    expect(useUiMenuStore.getState().activeMenuId).toBeNull();
  });

  it('closeMenu() with no id always clears', () => {
    useUiMenuStore.getState().openMenu('a');
    useUiMenuStore.getState().closeMenu();
    expect(useUiMenuStore.getState().activeMenuId).toBeNull();
  });
});
