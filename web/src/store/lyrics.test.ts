import { describe, it, expect, beforeEach } from 'vitest';
import { useLyricsViewStore } from './lyrics';

beforeEach(() => {
  useLyricsViewStore.setState({ open: false });
});

describe('useLyricsViewStore', () => {
  it('starts closed', () => {
    expect(useLyricsViewStore.getState().open).toBe(false);
  });

  it('toggle opens and closes', () => {
    useLyricsViewStore.getState().toggle();
    expect(useLyricsViewStore.getState().open).toBe(true);
    useLyricsViewStore.getState().toggle();
    expect(useLyricsViewStore.getState().open).toBe(false);
  });

  it('close always ends closed, even when called repeatedly or while already closed', () => {
    useLyricsViewStore.getState().toggle();
    useLyricsViewStore.getState().close();
    useLyricsViewStore.getState().close();
    expect(useLyricsViewStore.getState().open).toBe(false);
  });
});
