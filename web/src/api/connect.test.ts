import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setCredentials, setJwt } from './subsonic';
import {
  reportState, sendCommand, transferPlayback, renameDevice, fetchQueue, openStream, pollOnce,
  type StateReport,
} from './connect';

const json = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function lastCall() {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body as string) : undefined };
}

beforeEach(() => {
  setCredentials({ serverUrl: 'http://srv:4533/', username: 'u', password: 'p' });
  setJwt('tok');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { accepted: true, takeover: false })));
});

const report: StateReport = {
  deviceId: 'dev-12345678', index: 1, positionMs: 5000, playing: true, repeat: 'off', shuffle: false, counted: false,
};

describe('reportState', () => {
  it('POSTs the report with the bearer token', async () => {
    await reportState(report);

    const c = lastCall();
    expect(c.url).toBe('http://srv:4533/api/v1/connect/state');
    expect(c.init.method).toBe('POST');
    expect(c.headers.get('Authorization')).toBe('Bearer tok');
    expect(c.body).toEqual(report);
  });

  it.each([
    [200, { accepted: true, takeover: true }, { kind: 'ok', takeover: true }],
    [200, { accepted: true }, { kind: 'ok', takeover: false }],
    [200, { accepted: false, reason: 'not_active' }, { kind: 'not_active' }],
    [409, { error: 'need_queue' }, { kind: 'need_queue' }],
    [409, { error: 'unknown_device' }, { kind: 'unknown_device' }],
    [429, { error: 'rate_limited' }, { kind: 'rate_limited' }],
    [404, { error: 'Not found' }, { kind: 'unavailable' }],
    [500, { error: 'boom' }, { kind: 'error' }],
  ])('maps HTTP %i %j to %j', async (status, body, expected) => {
    vi.mocked(fetch).mockResolvedValue(json(status, body));
    expect(await reportState(report)).toEqual(expected);
  });

  it('reports a network failure as an error instead of throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await reportState(report)).toEqual({ kind: 'error' });
  });
});

describe('sendCommand', () => {
  it('sends a command with a fresh id each time and only includes a position for seeks', async () => {
    vi.mocked(fetch).mockResolvedValue(json(202, { delivered: true }));

    expect(await sendCommand('dev-12345678', 'next')).toBe('sent');
    const first = lastCall().body;
    await sendCommand('dev-12345678', 'seek', 12_345.6);
    const second = lastCall().body;

    expect(first).toMatchObject({ deviceId: 'dev-12345678', type: 'next' });
    expect('positionMs' in first).toBe(false);
    expect(second).toMatchObject({ type: 'seek', positionMs: 12_346 });
    expect(first.commandId).not.toBe(second.commandId);
  });

  it.each([
    [409, { error: 'no_active_device' }, 'no_active_device'],
    [409, { error: 'self' }, 'self'],
    [409, { error: 'unknown_device' }, 'unknown_device'],
    [429, {}, 'rate_limited'],
    [404, {}, 'unavailable'],
    [500, {}, 'error'],
  ])('maps HTTP %i %j to "%s"', async (status, body, expected) => {
    vi.mocked(fetch).mockResolvedValue(json(status, body));
    expect(await sendCommand('dev-12345678', 'pause')).toBe(expected);
  });

  it('survives a network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    expect(await sendCommand('dev-12345678', 'pause')).toBe('error');
  });
});

describe('transferPlayback', () => {
  it('POSTs from, to and play', async () => {
    vi.mocked(fetch).mockResolvedValue(json(202, { status: 'pending' }));
    await transferPlayback('dev-aaaaaaaa', 'dev-bbbbbbbb', false);

    expect(lastCall().url).toBe('http://srv:4533/api/v1/connect/transfer');
    expect(lastCall().body).toEqual({ deviceId: 'dev-aaaaaaaa', toDeviceId: 'dev-bbbbbbbb', play: false });
  });

  it.each([
    [200, { status: 'done' }, 'ok'],
    [202, { status: 'pending' }, 'pending'],
    [200, { status: 'noop' }, 'noop'],
    [404, { error: 'target_offline' }, 'target_offline'],
    [404, { error: 'Not found' }, 'unavailable'],
    [409, { error: 'nothing_playing' }, 'nothing_playing'],
    [409, { error: 'unknown_device' }, 'unknown_device'],
    [429, {}, 'rate_limited'],
    [500, {}, 'error'],
  ])('maps HTTP %i %j to "%s"', async (status, body, expected) => {
    vi.mocked(fetch).mockResolvedValue(json(status, body));
    expect(await transferPlayback('dev-aaaaaaaa', 'dev-bbbbbbbb')).toBe(expected);
  });
});

describe('renameDevice, fetchQueue', () => {
  it('renameDevice PATCHes the name and reports success', async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, { ok: true }));
    expect(await renameDevice('dev-12345678', 'Living room')).toBe(true);
    expect(lastCall().init.method).toBe('PATCH');
    expect(lastCall().body).toEqual({ deviceId: 'dev-12345678', name: 'Living room' });

    vi.mocked(fetch).mockResolvedValue(json(404, {}));
    expect(await renameDevice('dev-12345678', 'x')).toBe(false);
  });

  it('fetchQueue returns the queue, or null when there is none or the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, { queueVersion: 3, index: 1, songs: [{ id: 'a' }] }));
    expect(await fetchQueue()).toEqual({ queueVersion: 3, index: 1, songs: [{ id: 'a' }] });

    vi.mocked(fetch).mockResolvedValue(json(404, { error: 'nothing_playing' }));
    expect(await fetchQueue()).toBeNull();

    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    expect(await fetchQueue()).toBeNull();
  });
});

describe('streams', () => {
  const identity = { deviceId: 'dev-12345678', name: 'My PC & more', type: 'web' as const };

  it('openStream sends the device identity in the query (URL-encoded) and asks for an event stream', async () => {
    const ctrl = new AbortController();
    await openStream(identity, ctrl.signal);

    const c = lastCall();
    expect(c.url).toBe('http://srv:4533/api/v1/connect/stream?deviceId=dev-12345678&name=My%20PC%20%26%20more&type=web');
    expect(c.headers.get('Accept')).toBe('text/event-stream');
    expect(c.headers.get('Authorization')).toBe('Bearer tok');
    expect(c.init.signal).toBe(ctrl.signal);
  });

  it('pollOnce omits `since` on the first call and sends it afterwards', async () => {
    vi.mocked(fetch).mockResolvedValue(json(200, { events: [{ seq: 1, event: 'hello', data: {} }] }));
    const ctrl = new AbortController();

    const first = await pollOnce(identity, undefined, ctrl.signal);
    expect(lastCall().url).not.toContain('since');
    expect(first).toEqual({ status: 200, events: [{ seq: 1, event: 'hello', data: {} }] });

    await pollOnce(identity, 5, ctrl.signal);
    expect(lastCall().url).toContain('&since=5');
  });

  it('pollOnce hands back the status with no events when the server refuses', async () => {
    vi.mocked(fetch).mockResolvedValue(json(404, {}));
    expect(await pollOnce(identity, 3, new AbortController().signal)).toEqual({ status: 404, events: [] });
  });
});
