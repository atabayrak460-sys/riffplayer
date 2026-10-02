import { describe, it, expect } from 'vitest';
import { SseParser, positionNow, backoffMs, defaultDeviceName, newId } from './connectProtocol';
import type { PublicState } from '../api/connect';

const ev = (name: string, data: unknown, id?: number) => ({ kind: 'event', name, data, ...(id !== undefined ? { id } : {}) });

describe('SseParser', () => {
  it('parses a complete event with id, name and JSON data', () => {
    const items = new SseParser().push('id: 7\nevent: state\ndata: {"playing":true}\n\n');
    expect(items).toEqual([ev('state', { playing: true }, 7)]);
  });

  it('returns several events from one chunk, in order', () => {
    const items = new SseParser().push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n');
    expect(items).toEqual([ev('a', 1), ev('b', 2)]);
  });

  it('holds back an incomplete event until the rest arrives, wherever the chunk boundary falls', () => {
    const text = 'id: 1\nevent: devices\ndata: {"a":[1,2,3]}\n\n';
    for (let cut = 1; cut < text.length; cut++) {
      const parser = new SseParser();
      const first = parser.push(text.slice(0, cut));
      const second = parser.push(text.slice(cut));
      expect([...first, ...second]).toEqual([ev('devices', { a: [1, 2, 3] }, 1)]);
    }
  });

  it('reports heartbeat comments (they are how the client knows the connection is alive)', () => {
    expect(new SseParser().push(': ping\n\n')).toEqual([{ kind: 'comment' }]);
  });

  it('ignores the retry line and unknown fields', () => {
    const items = new SseParser().push('retry: 3000\n\nevent: x\nfoo: bar\ndata: 5\n\n');
    expect(items).toEqual([ev('x', 5)]);
  });

  it('understands CRLF line endings', () => {
    expect(new SseParser().push('event: x\r\ndata: 1\r\n\r\n')).toEqual([ev('x', 1)]);
  });

  it('joins multi-line data with newlines before parsing', () => {
    expect(new SseParser().push('event: x\ndata: {"a":\ndata: 1}\n\n')).toEqual([ev('x', { a: 1 })]);
  });

  it('drops a malformed event without breaking the ones after it', () => {
    const items = new SseParser().push('event: bad\ndata: {oops\n\nevent: ok\ndata: 1\n\n');
    expect(items).toEqual([ev('ok', 1)]);
  });

  it('drops an event with no name or no data', () => {
    expect(new SseParser().push('data: 1\n\nevent: only-name\n\n')).toEqual([]);
  });

  it('only accepts a numeric id', () => {
    expect(new SseParser().push('id: abc\nevent: x\ndata: 1\n\n')).toEqual([ev('x', 1)]);
  });

  it('strips a single leading space from values, not more', () => {
    expect(new SseParser().push('event:  x\ndata:  "  y"\n\n')).toEqual([ev(' x', '  y')]);
  });
});

describe('positionNow', () => {
  const state = (over: Partial<PublicState> = {}): PublicState => ({
    activeDeviceId: 'a', playing: true, song: null, index: 0, queueLength: 1, queueVersion: 1,
    positionMs: 10_000, positionAtMs: 1_000_000, durationMs: 200_000, repeat: 'off', shuffle: false, counted: false, ...over,
  });

  it('advances a playing track by the time passed since the report', () => {
    expect(positionNow(state(), 1_004_000)).toBe(14_000);
  });

  it('does not move a paused track', () => {
    expect(positionNow(state({ playing: false }), 1_060_000)).toBe(10_000);
  });

  it('never goes past the end of the track', () => {
    expect(positionNow(state({ positionMs: 199_000 }), 1_500_000)).toBe(200_000);
  });

  it('does not run backwards if the clocks are slightly off', () => {
    expect(positionNow(state(), 999_000)).toBe(10_000);
  });

  it('works without a known duration', () => {
    expect(positionNow(state({ durationMs: null }), 1_005_000)).toBe(15_000);
  });
});

describe('backoffMs', () => {
  it('doubles from one second and caps at thirty', () => {
    const mid = () => 0.5; // jitter factor exactly 1
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((n) => backoffMs(n, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('jitters by at most ±20%', () => {
    expect(backoffMs(2, () => 0)).toBe(3200);
    expect(backoffMs(2, () => 1)).toBe(4800);
  });

  it('treats a negative attempt like the first', () => {
    expect(backoffMs(-3, () => 0.5)).toBe(1000);
  });
});

describe('defaultDeviceName', () => {
  it.each([
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Web · Firefox on Linux'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'Web · Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0', 'Web · Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Web · Safari on macOS'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', 'Web · Chrome on Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Web · Safari on iOS'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 OPR/114.0', 'Web · Opera on Linux'],
  ])('names "%s" as %s', (ua, expected) => {
    expect(defaultDeviceName(ua)).toBe(expected);
  });

  it('falls back gracefully for an unknown or empty user agent', () => {
    expect(defaultDeviceName('')).toBe('Web · Browser');
    expect(defaultDeviceName('SomethingOdd/1.0')).toBe('Web · Browser');
    expect(defaultDeviceName('Mozilla/5.0 (X11; Linux)')).toBe('Web · Linux');
  });
});

describe('newId', () => {
  it('returns distinct ids that fit the server\'s device-id format', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
