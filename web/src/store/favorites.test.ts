import { describe, it, expect, beforeEach } from 'vitest';
import { useFavoritesStore, selectStarred } from './favorites';

beforeEach(() => {
  useFavoritesStore.setState({ starred: {} });
});

describe('useFavoritesStore', () => {
  it('is unset for an item that has never been seen', () => {
    expect(selectStarred('track', '1')(useFavoritesStore.getState())).toBeUndefined();
  });

  it('hydrate seeds a value the first time an item is seen', () => {
    useFavoritesStore.getState().hydrate('track', '1', true);
    expect(selectStarred('track', '1')(useFavoritesStore.getState())).toBe(true);
  });

  it('hydrate does not clobber an already-known value', () => {
    // Simulates: user starred the track (setStarred), then a second, still-in-flight
    // fetch for that same track (started before the toggle) resolves and tries to
    // hydrate it back to its old, stale value.
    useFavoritesStore.getState().setStarred('track', '1', true);
    useFavoritesStore.getState().hydrate('track', '1', false);
    expect(selectStarred('track', '1')(useFavoritesStore.getState())).toBe(true);
  });

  it('setStarred always overwrites, regardless of prior value', () => {
    useFavoritesStore.getState().hydrate('track', '1', false);
    useFavoritesStore.getState().setStarred('track', '1', true);
    expect(selectStarred('track', '1')(useFavoritesStore.getState())).toBe(true);
  });

  it('toggling a track updates every consumer reading that same id — single source of truth', () => {
    // Two "views" of the same track (e.g. Recently Played and All Songs) both
    // hydrate from their own fetched data, agreeing it starts unstarred.
    useFavoritesStore.getState().hydrate('track', '42', false);
    useFavoritesStore.getState().hydrate('track', '42', false);
    expect(selectStarred('track', '42')(useFavoritesStore.getState())).toBe(false);

    // Starring it from one view...
    useFavoritesStore.getState().setStarred('track', '42', true);

    // ...is immediately visible to any other selector reading that same id.
    expect(selectStarred('track', '42')(useFavoritesStore.getState())).toBe(true);
  });

  it('keys are scoped per item type, so a track and album sharing an id do not collide', () => {
    useFavoritesStore.getState().setStarred('track', '1', true);
    useFavoritesStore.getState().setStarred('album', '1', false);
    expect(selectStarred('track', '1')(useFavoritesStore.getState())).toBe(true);
    expect(selectStarred('album', '1')(useFavoritesStore.getState())).toBe(false);
  });
});
