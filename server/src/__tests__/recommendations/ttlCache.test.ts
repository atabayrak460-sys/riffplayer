import { describe, it, expect, vi, afterEach } from 'vitest';
import { TtlCache } from '../../recommendations/ttlCache.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('returns null for a missing key', () => {
    const cache = new TtlCache<string>(1000, 10);
    expect(cache.get('missing')).toBeNull();
  });

  it('returns a value that was just set', () => {
    const cache = new TtlCache<string>(1000, 10);
    cache.set('a', 'value-a');
    expect(cache.get('a')).toBe('value-a');
  });

  it('expires an entry once its TTL has passed', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string>(1000, 10);
    cache.set('a', 'value-a');
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeNull();
  });

  it('does not expire an entry before its TTL has passed', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string>(1000, 10);
    cache.set('a', 'value-a');
    vi.advanceTimersByTime(999);
    expect(cache.get('a')).toBe('value-a');
  });

  it('never exceeds maxEntries, evicting the oldest entry to make room', () => {
    const cache = new TtlCache<number>(1000 * 60 * 60, 3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size).toBe(3);

    cache.set('d', 4); // 'a' is oldest — should be evicted
    expect(cache.size).toBe(3);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('overwriting an existing key does not count against the entry cap', () => {
    const cache = new TtlCache<number>(1000 * 60 * 60, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 100); // update, not a new entry
    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBe(100);
    expect(cache.get('b')).toBe(2);
  });
});
