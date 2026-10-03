import { describe, it, expect, vi } from 'vitest';
import { createSseSink, attachCleanup, type SseTarget } from '../../connect/sse.js';

class FakeRaw implements SseTarget {
  writableEnded = false;
  destroyed = false;
  writableLength = 0;
  written: string[] = [];
  ended = 0;
  destroyedCalls = 0;
  listeners: Record<string, (() => void)[]> = {};
  write(chunk: string): boolean {
    if (this.writableEnded) throw new Error('write after end');
    this.written.push(chunk);
    return true;
  }
  end(): void {
    this.writableEnded = true;
    this.ended++;
  }
  destroy(): void {
    this.destroyed = true;
    this.destroyedCalls++;
  }
  on(event: string, cb: () => void): void {
    (this.listeners[event] ??= []).push(cb);
  }
  emit(event: string): void {
    for (const cb of this.listeners[event] ?? []) cb();
  }
}

describe('createSseSink', () => {
  it('writes events in the SSE format', () => {
    const raw = new FakeRaw();
    createSseSink(raw).send(3, { name: 'devices', data: { devices: [], activeDeviceId: null } });
    expect(raw.written).toEqual(['id: 3\nevent: devices\ndata: {"devices":[],"activeDeviceId":null}\n\n']);
  });

  it('never writes after the response has ended or the socket is gone (a write-after-end would throw)', () => {
    const raw = new FakeRaw();
    const sink = createSseSink(raw);
    sink.end();
    expect(() => sink.send(1, { name: 'revoked', data: {} })).not.toThrow();
    expect(raw.written).toEqual([]);

    const gone = new FakeRaw();
    gone.destroyed = true;
    expect(() => createSseSink(gone).send(1, { name: 'revoked', data: {} })).not.toThrow();
    expect(gone.written).toEqual([]);
  });

  it('ending twice ends the response once', () => {
    const raw = new FakeRaw();
    const sink = createSseSink(raw);
    sink.end();
    sink.end();
    expect(raw.ended).toBe(1);
  });

  it('drops a client that does not read: once too much is queued in memory the connection is destroyed', () => {
    const raw = new FakeRaw();
    const onOverflow = vi.fn();
    const sink = createSseSink(raw, { maxBuffered: 1000, onOverflow });

    raw.writableLength = 500;
    sink.send(1, { name: 'devices', data: { devices: [], activeDeviceId: null } });
    expect(raw.written.length).toBe(1);
    expect(onOverflow).not.toHaveBeenCalled();

    raw.writableLength = 5000;
    sink.send(2, { name: 'devices', data: { devices: [], activeDeviceId: null } });

    expect(raw.written.length).toBe(1); // nothing more is queued
    expect(raw.destroyedCalls).toBe(1);
    expect(onOverflow).toHaveBeenCalledTimes(1);

    sink.send(3, { name: 'devices', data: { devices: [], activeDeviceId: null } });
    expect(raw.destroyedCalls).toBe(1); // and it is only destroyed once
  });

  it('does not deliver once the credentials are stale, and revokes that connection instead', () => {
    const raw = new FakeRaw();
    let stale = false;
    const onStale = vi.fn();
    const sink = createSseSink(raw, { isStale: () => stale, onStale });

    sink.send(1, { name: 'devices', data: { devices: [], activeDeviceId: null } });
    expect(raw.written.length).toBe(1);

    stale = true;
    sink.send(2, { name: 'devices', data: { devices: [], activeDeviceId: 'secret-device' } });

    expect(raw.written.length).toBe(1);
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('a revoked event itself is still delivered to a stale connection (it is how the client learns)', () => {
    const raw = new FakeRaw();
    const sink = createSseSink(raw, { isStale: () => true, onStale: vi.fn() });
    sink.send(9, { name: 'revoked', data: {} });
    expect(raw.written[0]).toContain('event: revoked');
  });
});

describe('attachCleanup', () => {
  it('runs the cleanup when the request closes, once', () => {
    const req = new FakeRaw();
    const cleanup = vi.fn();
    attachCleanup(req, cleanup);
    expect(cleanup).not.toHaveBeenCalled();

    req.emit('close');
    req.emit('close');

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs it at once when the socket was already gone (its close event can no longer fire)', () => {
    const req = new FakeRaw();
    req.destroyed = true;
    const cleanup = vi.fn();

    attachCleanup(req, cleanup);

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('review: a stale connection that cannot be revoked yet', () => {
  it('retries the revocation on the next delivery until the hook reports it acted', () => {
    const raw = new FakeRaw();
    let ready = false;
    const onStale = vi.fn(() => ready);
    const sink = createSseSink(raw, { isStale: () => true, onStale });

    sink.send(1, { name: 'devices', data: { devices: [], activeDeviceId: null } }); // e.g. during connect, before the connection has an id
    sink.send(2, { name: 'devices', data: { devices: [], activeDeviceId: null } });
    expect(onStale).toHaveBeenCalledTimes(2);

    ready = true;
    sink.send(3, { name: 'devices', data: { devices: [], activeDeviceId: null } });
    sink.send(4, { name: 'devices', data: { devices: [], activeDeviceId: null } });

    expect(onStale).toHaveBeenCalledTimes(3); // acted once: not called again
    expect(raw.written).toEqual([]); // and nothing but "revoked" was ever delivered
  });
});
