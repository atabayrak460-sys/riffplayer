// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

// Own file: it re-imports the store several times, which would replace the shared fake <audio> element
// the other connect tests rely on.
class FakeAudio {
  preload = ''; src = ''; volume = 1; paused = true; currentTime = 0; duration = 0;
  addEventListener() {}
  removeEventListener() {}
  play() { return Promise.resolve(); }
  pause() {}
  load() {}
}
vi.stubGlobal('Audio', FakeAudio);
vi.mock('../lib/offlineDb', () => ({ getTrackAudioBlob: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('Audio', FakeAudio);
  localStorage.clear();
});

async function freshPageLoad() {
  vi.resetModules();
  return (await import('./connect')).useConnectStore.getState().deviceId;
}

describe('device identity', () => {
  it('every page load gets its own device id, so a duplicated tab is a different device', async () => {
    // "Duplicate tab" copies sessionStorage: emulate a working one that both loads share
    const memory = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => { memory.set(k, v); },
      removeItem: (k: string) => { memory.delete(k); },
    });

    const first = await freshPageLoad();
    const second = await freshPageLoad();

    expect(first.slice(0, 36)).toBe(second.slice(0, 36)); // same browser...
    expect(first).not.toBe(second); // ...two devices
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('keeps the browser part across loads, so renaming and recognising the browser still works', async () => {
    const first = await freshPageLoad();
    const stored = localStorage.getItem('riffplayer-device-id');

    const second = await freshPageLoad();

    expect(stored).toBeTruthy();
    expect(first.startsWith(stored!)).toBe(true);
    expect(second.startsWith(stored!)).toBe(true);
  });
});
