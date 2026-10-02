import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from './toast';
import { useMobileNavStore } from './mobileNav';

describe('useToastStore', () => {
  beforeEach(() => useToastStore.setState({ message: null }));

  it('starts empty', () => {
    expect(useToastStore.getState().message).toBeNull();
  });

  it('shows a message and dismisses it', () => {
    useToastStore.getState().show('Saved');
    expect(useToastStore.getState().message).toBe('Saved');

    useToastStore.getState().dismiss();
    expect(useToastStore.getState().message).toBeNull();
  });

  it('keeps only the latest message (no queue)', () => {
    useToastStore.getState().show('first');
    useToastStore.getState().show('second');

    expect(useToastStore.getState().message).toBe('second');
    useToastStore.getState().dismiss();
    expect(useToastStore.getState().message).toBeNull();
  });
});

describe('useMobileNavStore', () => {
  beforeEach(() => useMobileNavStore.setState({ isOpen: false }));

  it('starts closed', () => {
    expect(useMobileNavStore.getState().isOpen).toBe(false);
  });

  it('opens and closes', () => {
    useMobileNavStore.getState().open();
    expect(useMobileNavStore.getState().isOpen).toBe(true);
    useMobileNavStore.getState().close();
    expect(useMobileNavStore.getState().isOpen).toBe(false);
  });

  it('open and close are idempotent', () => {
    useMobileNavStore.getState().open();
    useMobileNavStore.getState().open();
    expect(useMobileNavStore.getState().isOpen).toBe(true);
    useMobileNavStore.getState().close();
    useMobileNavStore.getState().close();
    expect(useMobileNavStore.getState().isOpen).toBe(false);
  });
});
