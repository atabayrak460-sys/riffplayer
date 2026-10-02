// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

type Listener = () => void;

let matches = false;
let listeners: Listener[] = [];
const removeEventListener = vi.fn((_: string, cb: Listener) => {
  listeners = listeners.filter((l) => l !== cb);
});

beforeEach(() => {
  matches = false;
  listeners = [];
  removeEventListener.mockClear();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() { return matches; },
    media: query,
    addEventListener: (_: string, cb: Listener) => { listeners.push(cb); },
    removeEventListener,
  })) as unknown as typeof window.matchMedia;
});

const flip = (value: boolean) => act(() => { matches = value; listeners.forEach((l) => l()); });

describe('useMediaQuery', () => {
  it('starts with the query\'s current result', () => {
    matches = true;
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
  });

  it('is false when the query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    expect(result.current).toBe(false);
  });

  it('follows the query as the window changes', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));

    flip(true);
    expect(result.current).toBe(true);
    flip(false);
    expect(result.current).toBe(false);
  });

  it('re-subscribes when the query string changes, dropping the old listener', () => {
    const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), { initialProps: { q: '(a)' } });
    matches = true;

    rerender({ q: '(b)' });

    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(b)');
    expect(removeEventListener).toHaveBeenCalled();
    expect(listeners).toHaveLength(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(a)'));
    expect(listeners).toHaveLength(1);

    unmount();

    expect(listeners).toHaveLength(0);
  });
});
