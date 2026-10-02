// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { Song } from '../api/types';
import type { DeviceInfo, PublicState } from '../api/connect';

// player.ts builds its <audio> element at import time; a tiny fake keeps jsdom from logging
// "not implemented" for every play()/pause() and lets tests see whether audio was silenced.
class FakeAudio {
  static instance: FakeAudio;
  preload = ''; src = ''; volume = 1; paused = true; currentTime = 0; duration = 0;
  constructor() { FakeAudio.instance = this; }
  addEventListener() {}
  removeEventListener() {}
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
}
vi.stubGlobal('Audio', FakeAudio);

vi.mock('../api/connect', () => ({
  openStream: vi.fn(),
  pollOnce: vi.fn(),
  reportState: vi.fn(),
  sendCommand: vi.fn(),
  transferPlayback: vi.fn(),
  renameDevice: vi.fn(),
  fetchQueue: vi.fn(),
}));
vi.mock('../lib/offlineDb', () => ({ getTrackAudioBlob: vi.fn() }));
vi.mock('../api/subsonic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/subsonic')>()),
  scrobble: vi.fn().mockResolvedValue(undefined),
}));

const api = await import('../api/connect');
const { useConnectStore } = await import('./connect');
const { usePlayerStore, remote: remoteRegistry } = await import('./player');
const { useAuthStore } = await import('./auth');
const { useToastStore } = await import('./toast');

const ME = 'me-device-0001';
const OTHER = 'other-device-01';

const song = (id: string, extra: Partial<Song> = {}): Song =>
  ({ id, title: `Song ${id}`, artist: 'Artist', album: 'Album', albumId: 'al1', artistId: 'ar1', duration: 200, ...extra }) as Song;

const device = (id: string, over: Partial<DeviceInfo> = {}): DeviceInfo =>
  ({ id, name: id === ME ? 'My PC' : 'Phone', type: 'web', online: true, unreachable: false, active: false, ...over });

function remoteState(over: Partial<PublicState> = {}): PublicState {
  return {
    activeDeviceId: OTHER, playing: true, song: song('r1', { title: 'Remote Song' }), index: 0, queueLength: 3,
    queueVersion: 1, positionMs: 10_000, positionAtMs: Date.now(), durationMs: 200_000, repeat: 'off', shuffle: false,
    counted: false, ...over,
  };
}

const handle = (name: string, data: unknown) => useConnectStore.getState()._handle(name, data);
const connectState = () => useConnectStore.getState();

/** Snapshot in which `OTHER` is the one playing. */
function otherIsPlaying(over: Partial<PublicState> = {}) {
  handle('snapshot', {
    devices: [device(ME), device(OTHER, { active: true })],
    activeDeviceId: OTHER,
    state: remoteState(over),
  });
}

function startOnline() {
  vi.mocked(api.openStream).mockReturnValue(new Promise(() => {}));
  connectState().start();
  useConnectStore.setState({ status: 'online' });
}

const playerBase = {
  queue: [], queueIndex: -1, currentSong: null, playing: false, currentTime: 0, duration: 0,
  repeatMode: 'off' as const, shuffle: false, originalQueue: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  usePlayerStore.setState({ ...playerBase });
  useConnectStore.setState({
    status: 'online', transport: 'stream', deviceId: ME, deviceName: 'My PC',
    devices: [], activeDeviceId: null, remote: null,
  });
  useToastStore.setState({ message: null });
  vi.mocked(api.reportState).mockResolvedValue({ kind: 'ok', takeover: false });
  vi.mocked(api.sendCommand).mockResolvedValue('sent');
  vi.mocked(api.transferPlayback).mockResolvedValue('ok');
  vi.mocked(api.renameDevice).mockResolvedValue(true);
  vi.mocked(api.fetchQueue).mockResolvedValue(null);
  FakeAudio.instance.paused = true;
});

afterEach(() => {
  connectState().stop();
  vi.useRealTimers();
});

// ── Events → state ───────────────────────────────────────────────────────────

describe('events', () => {
  it('hello marks the device online', () => {
    useConnectStore.setState({ status: 'connecting' });
    handle('hello', { serverTimeMs: Date.now(), you: ME });
    expect(connectState().status).toBe('online');
  });

  it('snapshot stores the devices, the active device and the remote state', () => {
    otherIsPlaying();

    expect(connectState().devices.map((d) => d.id)).toEqual([ME, OTHER]);
    expect(connectState().activeDeviceId).toBe(OTHER);
    expect(connectState().remote?.song?.title).toBe('Remote Song');
  });

  it('devices and state events update their parts', () => {
    otherIsPlaying();
    handle('devices', { devices: [device(ME), device(OTHER, { name: 'Renamed', active: true })], activeDeviceId: OTHER });
    expect(connectState().devices[1].name).toBe('Renamed');

    handle('state', remoteState({ index: 2, positionMs: 50_000 }));
    expect(connectState().remote?.index).toBe(2);
  });

  it('revoked signs the user out', () => {
    const logout = vi.fn();
    useAuthStore.setState({ logout });
    handle('revoked', {});
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('a server error event (e.g. too many devices) marks the connection offline', () => {
    handle('error', { error: 'too_many_devices' });
    expect(connectState().status).toBe('offline');
  });

  it('ignores event names it does not know', () => {
    expect(() => handle('from-the-future', { a: 1 })).not.toThrow();
  });
});

// ── Mirror mode ──────────────────────────────────────────────────────────────

describe('mirror mode', () => {
  it('shows what the other device plays through the normal player store and silences local audio', () => {
    FakeAudio.instance.paused = false;
    usePlayerStore.setState({ queue: [song('local')], queueIndex: 0, currentSong: song('local') });

    otherIsPlaying({ repeat: 'all', shuffle: true });

    const p = usePlayerStore.getState();
    expect(p.currentSong?.title).toBe('Remote Song');
    expect(p.playing).toBe(true);
    expect(p.currentTime).toBeCloseTo(10, 0);
    expect(p.duration).toBe(200);
    expect(p.repeatMode).toBe('all');
    expect(p.shuffle).toBe(true);
    expect(p.queue).toEqual([]);
    expect(p.queueIndex).toBe(-1);
    expect(FakeAudio.instance.paused).toBe(true);
  });

  it('keeps the position moving while the other device plays, and not while it is paused', async () => {
    otherIsPlaying({ positionMs: 10_000, positionAtMs: Date.now() });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(usePlayerStore.getState().currentTime).toBeCloseTo(13, 0);

    handle('state', remoteState({ playing: false, positionMs: 13_000, positionAtMs: Date.now() }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(usePlayerStore.getState().currentTime).toBeCloseTo(13, 0);
    expect(usePlayerStore.getState().playing).toBe(false);
  });

  it('does not run past the end of the track', async () => {
    otherIsPlaying({ positionMs: 199_000, positionAtMs: Date.now() });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(usePlayerStore.getState().currentTime).toBe(200);
  });

  it('falls back to the song\'s own duration when the report has none', () => {
    otherIsPlaying({ durationMs: null, song: song('r1', { duration: 321 }) });
    expect(usePlayerStore.getState().duration).toBe(321);
  });

  it('follows new state events from the other device', () => {
    otherIsPlaying();
    handle('state', remoteState({ song: song('r2', { title: 'Next One' }), index: 1 }));
    expect(usePlayerStore.getState().currentSong?.title).toBe('Next One');
  });

  it('stops mirroring once this device is the one playing', async () => {
    otherIsPlaying();
    handle('devices', { devices: [device(ME, { active: true }), device(OTHER)], activeDeviceId: ME });

    usePlayerStore.setState({ currentTime: 77 });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(usePlayerStore.getState().currentTime).toBe(77);
  });

  it('stops mirroring when the connection drops (the local controls are the only ones that can work)', async () => {
    startOnline();
    otherIsPlaying();
    useConnectStore.setState({ status: 'offline' });
    handle('devices', { devices: [device(ME), device(OTHER, { active: true })], activeDeviceId: OTHER });

    usePlayerStore.setState({ currentTime: 55 });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(usePlayerStore.getState().currentTime).toBe(55);
  });

  it('pauses local audio when another device takes over from this one', () => {
    useConnectStore.setState({ activeDeviceId: ME });
    FakeAudio.instance.paused = false;

    handle('devices', { devices: [device(ME), device(OTHER, { active: true })], activeDeviceId: OTHER });
    handle('state', remoteState());

    expect(FakeAudio.instance.paused).toBe(true);
  });
});

// ── Transport actions while only a remote ────────────────────────────────────

describe('controlling the other device', () => {
  beforeEach(() => {
    startOnline();
    otherIsPlaying();
  });

  it('pause/play go to the other device, and the button flips at once', async () => {
    usePlayerStore.getState().togglePlay();
    await vi.advanceTimersByTimeAsync(0);

    expect(api.sendCommand).toHaveBeenCalledWith(ME, 'pause', undefined);
    expect(usePlayerStore.getState().playing).toBe(false);
    expect(connectState().remote?.playing).toBe(false);

    usePlayerStore.getState().togglePlay();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.sendCommand).toHaveBeenLastCalledWith(ME, 'play', undefined);
    expect(usePlayerStore.getState().playing).toBe(true);
  });

  it('keeps the shown position steady across an optimistic pause', async () => {
    await vi.advanceTimersByTimeAsync(4_000); // 4 s of the remote song have passed
    usePlayerStore.getState().togglePlay();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(usePlayerStore.getState().currentTime).toBeCloseTo(14, 0);
  });

  it('next and previous go to the other device', async () => {
    usePlayerStore.getState().next();
    usePlayerStore.getState().prev();
    await vi.advanceTimersByTimeAsync(0);

    expect(api.sendCommand).toHaveBeenCalledWith(ME, 'next', undefined);
    expect(api.sendCommand).toHaveBeenCalledWith(ME, 'previous', undefined);
  });

  it('a slider drag sends only the position where it comes to rest', async () => {
    const seek = usePlayerStore.getState().seek;
    seek(30);
    await vi.advanceTimersByTimeAsync(50);
    seek(60);
    await vi.advanceTimersByTimeAsync(50);
    seek(90);
    expect(api.sendCommand).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);

    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    expect(api.sendCommand).toHaveBeenCalledWith(ME, 'seek', 90_000);
  });

  it('says so when the other device cannot be reached', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue('no_active_device');
    usePlayerStore.getState().next();
    await vi.advanceTimersByTimeAsync(0);

    expect(useToastStore.getState().message).toBe("Phone isn't reachable right now");
  });

  it('says so when the server cannot be reached', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue('error');
    usePlayerStore.getState().next();
    await vi.advanceTimersByTimeAsync(0);

    expect(useToastStore.getState().message).toBe("Couldn't reach the server");
  });

  it('acts locally again when this device is the one playing', async () => {
    handle('devices', { devices: [device(ME, { active: true }), device(OTHER)], activeDeviceId: ME });
    usePlayerStore.setState({ queue: [song('a'), song('b')], queueIndex: 0, currentSong: song('a') });

    usePlayerStore.getState().seek(5);
    await vi.advanceTimersByTimeAsync(500);

    expect(api.sendCommand).not.toHaveBeenCalled();
    expect(FakeAudio.instance.currentTime).toBe(5);
  });

  it('acts locally while the connection is down', async () => {
    useConnectStore.setState({ status: 'offline' });
    usePlayerStore.getState().next();
    await vi.advanceTimersByTimeAsync(0);

    expect(api.sendCommand).not.toHaveBeenCalled();
  });
});

// ── Commands executed here ───────────────────────────────────────────────────

describe('commands from another device', () => {
  const cmd = (type: string, over: Record<string, unknown> = {}) => ({
    commandId: `c-${Math.random()}`, type, expiresAtMs: Date.now() + 5_000, ...over,
  });
  let actions: {
    next: Mock<() => void>; prev: Mock<() => void>; seek: Mock<(s: number) => void>; togglePlay: Mock<() => void>;
  };

  beforeEach(() => {
    startOnline();
    actions = { next: vi.fn<() => void>(), prev: vi.fn<() => void>(), seek: vi.fn<(s: number) => void>(), togglePlay: vi.fn<() => void>() };
    usePlayerStore.setState(actions);
  });

  it('next, previous and seek are executed on the local player', () => {
    handle('command', cmd('next'));
    handle('command', cmd('previous'));
    handle('command', cmd('seek', { positionMs: 42_000 }));

    expect(actions.next).toHaveBeenCalledTimes(1);
    expect(actions.prev).toHaveBeenCalledTimes(1);
    expect(actions.seek).toHaveBeenCalledWith(42);
  });

  it('play only starts a paused player and pause only stops a playing one', () => {
    usePlayerStore.setState({ playing: true });
    handle('command', cmd('play'));
    expect(actions.togglePlay).not.toHaveBeenCalled();
    handle('command', cmd('pause'));
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);

    usePlayerStore.setState({ playing: false });
    handle('command', cmd('pause'));
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    handle('command', cmd('play'));
    expect(actions.togglePlay).toHaveBeenCalledTimes(2);
  });

  it('runs a command once even if it is delivered twice', () => {
    const c = cmd('next');
    handle('command', c);
    handle('command', c);
    expect(actions.next).toHaveBeenCalledTimes(1);
  });

  it('ignores a command that has expired', () => {
    handle('command', cmd('next', { expiresAtMs: Date.now() - 1 }));
    expect(actions.next).not.toHaveBeenCalled();
  });

  it('never forwards a command back out, even if this device already looks like a remote', () => {
    otherIsPlaying();
    let seenRemote: boolean | undefined;
    actions.next.mockImplementation(() => { seenRemote = remoteRegistry.current?.isRemote(); });

    handle('command', cmd('next'));

    expect(seenRemote).toBe(false);
    expect(remoteRegistry.current?.isRemote()).toBe(true); // and back to normal afterwards
  });
});

// ── Receiving a handover ─────────────────────────────────────────────────────

describe('load (handover to this device)', () => {
  const load = { queueVersion: 2, index: 1, positionMs: 83_000, play: true, counted: true };

  it('fetches the queue and restores it at the given position, keeping the other device\'s repeat/shuffle', async () => {
    const restoreQueue = vi.fn();
    usePlayerStore.setState({ restoreQueue });
    otherIsPlaying({ repeat: 'all', shuffle: true });
    vi.mocked(api.fetchQueue).mockResolvedValue({ queueVersion: 2, index: 1, songs: [song('a'), song('b'), song('c')] });

    handle('load', load);
    await vi.advanceTimersByTimeAsync(0);

    expect(restoreQueue).toHaveBeenCalledWith(expect.any(Array), 1, 83_000, true, true);
    expect(restoreQueue.mock.calls[0][0].map((s: Song) => s.id)).toEqual(['a', 'b', 'c']);
    expect(usePlayerStore.getState().repeatMode).toBe('all');
    expect(usePlayerStore.getState().shuffle).toBe(true);
  });

  it('does nothing when the server has no queue to give', async () => {
    const restoreQueue = vi.fn();
    usePlayerStore.setState({ restoreQueue });

    handle('load', load);
    await vi.advanceTimersByTimeAsync(0);

    expect(restoreQueue).not.toHaveBeenCalled();
  });

  it('plays a paused handover without starting it', async () => {
    const restoreQueue = vi.fn();
    usePlayerStore.setState({ restoreQueue });
    vi.mocked(api.fetchQueue).mockResolvedValue({ queueVersion: 2, index: 0, songs: [song('a')] });

    handle('load', { ...load, play: false, counted: false });
    await vi.advanceTimersByTimeAsync(0);

    expect(restoreQueue).toHaveBeenCalledWith(expect.any(Array), 0, 83_000, false, false);
  });
});

// ── Reporting this device's playback ─────────────────────────────────────────

describe('reporting local playback', () => {
  const play = (over: Record<string, unknown> = {}) =>
    usePlayerStore.setState({
      queue: [song('a'), song('b')], queueIndex: 0, currentSong: song('a'), playing: true, currentTime: 12.3,
      ...over,
    });

  beforeEach(() => {
    startOnline();
  });

  it('reports what is playing, with the whole queue the first time', async () => {
    play();
    await vi.advanceTimersByTimeAsync(250);

    expect(api.reportState).toHaveBeenCalledTimes(1);
    expect(api.reportState).toHaveBeenCalledWith({
      deviceId: ME, queueIds: ['a', 'b'], index: 0, positionMs: 12_300, playing: true,
      repeat: 'off', shuffle: false, counted: false,
    });
  });

  it('leaves the queue out of later reports until it changes', async () => {
    play();
    await vi.advanceTimersByTimeAsync(250);
    usePlayerStore.setState({ playing: false });
    await vi.advanceTimersByTimeAsync(250);

    const second = vi.mocked(api.reportState).mock.calls[1][0];
    expect(second.playing).toBe(false);
    expect('queueIds' in second).toBe(false);

    usePlayerStore.setState({ queue: [song('a'), song('b'), song('c')] });
    await vi.advanceTimersByTimeAsync(250);
    expect(vi.mocked(api.reportState).mock.calls[2][0].queueIds).toEqual(['a', 'b', 'c']);
  });

  it('coalesces a burst of changes into one report', async () => {
    play();
    usePlayerStore.setState({ queueIndex: 1 });
    usePlayerStore.setState({ repeatMode: 'all' });
    await vi.advanceTimersByTimeAsync(250);

    expect(api.reportState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.reportState).mock.calls[0][0]).toMatchObject({ index: 1, repeat: 'all' });
  });

  it('resends once with the queue when the server asks for it, and does not loop', async () => {
    play();
    await vi.advanceTimersByTimeAsync(250);
    vi.mocked(api.reportState).mockClear();
    vi.mocked(api.reportState).mockResolvedValue({ kind: 'need_queue' });

    usePlayerStore.setState({ playing: false });
    await vi.advanceTimersByTimeAsync(250);

    expect(api.reportState).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.reportState).mock.calls[1][0].queueIds).toEqual(['a', 'b']);
  });

  it('sends nothing for an empty queue or while the connection is down', async () => {
    usePlayerStore.setState({ playing: true });
    await vi.advanceTimersByTimeAsync(250);
    expect(api.reportState).not.toHaveBeenCalled();

    useConnectStore.setState({ status: 'offline' });
    play();
    await vi.advanceTimersByTimeAsync(250);
    expect(api.reportState).not.toHaveBeenCalled();
  });

  it('a paused bystander stays quiet, but starting playback here takes over from the other device', async () => {
    otherIsPlaying();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.reportState).not.toHaveBeenCalled(); // mirroring is not "the user doing something"

    usePlayerStore.setState({ queue: [song('a')], queueIndex: 0, currentSong: song('a'), playing: false });
    await vi.advanceTimersByTimeAsync(250);
    expect(api.reportState).not.toHaveBeenCalled();

    usePlayerStore.setState({ playing: true });
    await vi.advanceTimersByTimeAsync(250);
    expect(api.reportState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.reportState).mock.calls[0][0]).toMatchObject({ playing: true, queueIds: ['a'] });
  });

  it('while the takeover is in flight the mirror does not put the other device\'s track back over the one just started here', async () => {
    otherIsPlaying();
    usePlayerStore.setState({ queue: [song('a')], queueIndex: 0, currentSong: song('a'), playing: true });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(usePlayerStore.getState().currentSong?.id).toBe('a');
    expect(usePlayerStore.getState().queue).toHaveLength(1);

    // confirmed: this device is now the active one and mirroring stays off
    handle('devices', { devices: [device(ME, { active: true }), device(OTHER)], activeDeviceId: ME });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(usePlayerStore.getState().currentSong?.id).toBe('a');
  });

  it('if the takeover is never confirmed (e.g. the browser blocked autoplay) the mirror resumes after a few seconds', async () => {
    otherIsPlaying();
    usePlayerStore.setState({ queue: [song('a')], queueIndex: 0, currentSong: song('a'), playing: false });

    await vi.advanceTimersByTimeAsync(7_000);
    expect(usePlayerStore.getState().currentSong?.id).toBe('a');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(usePlayerStore.getState().currentSong?.title).toBe('Remote Song');
  });

  it('adding to the queue while remote is not mistaken for a takeover', async () => {
    otherIsPlaying();
    usePlayerStore.getState().addToQueue(song('x'));

    await vi.advanceTimersByTimeAsync(300);

    expect(usePlayerStore.getState().currentSong?.title).toBe('Remote Song');
  });

  it('reports a seek, but not ordinary playback progress', async () => {
    useConnectStore.setState({ activeDeviceId: ME });
    play({ currentTime: 10 });
    await vi.advanceTimersByTimeAsync(250);
    vi.mocked(api.reportState).mockClear();

    for (let i = 1; i <= 8; i++) {
      await vi.advanceTimersByTimeAsync(250);
      usePlayerStore.setState({ currentTime: 10 + i * 0.25 });
    }
    await vi.advanceTimersByTimeAsync(250);
    expect(api.reportState).not.toHaveBeenCalled();

    usePlayerStore.setState({ currentTime: 120 }); // a jump
    await vi.advanceTimersByTimeAsync(250);
    expect(api.reportState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.reportState).mock.calls[0][0].positionMs).toBe(120_000);
  });

  it('re-reports every ten seconds while playing here (drift correction), not while paused or remote', async () => {
    useConnectStore.setState({ activeDeviceId: ME });
    play();
    await vi.advanceTimersByTimeAsync(250);
    vi.mocked(api.reportState).mockClear();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.reportState).toHaveBeenCalledTimes(1);

    usePlayerStore.setState({ playing: false });
    await vi.advanceTimersByTimeAsync(250);
    vi.mocked(api.reportState).mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.reportState).not.toHaveBeenCalled();
  });

  it('reports the queue again after a (re)connect, since the server may have restarted', async () => {
    useConnectStore.setState({ activeDeviceId: ME });
    play();
    await vi.advanceTimersByTimeAsync(250);
    vi.mocked(api.reportState).mockClear();

    handle('snapshot', { devices: [device(ME, { active: true })], activeDeviceId: ME, state: null });
    await vi.advanceTimersByTimeAsync(0);

    expect(api.reportState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.reportState).mock.calls[0][0].queueIds).toEqual(['a', 'b']);
  });

  it('gives up cleanly against a server without Connect', async () => {
    vi.mocked(api.reportState).mockResolvedValue({ kind: 'unavailable' });
    play();
    await vi.advanceTimersByTimeAsync(250);

    expect(connectState().status).toBe('unavailable');
    expect(remoteRegistry.current).toBeNull();
  });
});

// ── Transfer and rename ──────────────────────────────────────────────────────

describe('transfer and rename', () => {
  it('transferTo asks the server to move playback from this device to the chosen one', async () => {
    await connectState().transferTo(OTHER);
    expect(api.transferPlayback).toHaveBeenCalledWith(ME, OTHER, true);
  });

  it('transferHere ("Continue here") targets this device', async () => {
    await connectState().transferHere();
    expect(api.transferPlayback).toHaveBeenCalledWith(ME, ME, true);
  });

  it.each([
    ['target_offline', 'That device is offline'],
    ['nothing_playing', 'Nothing has been played yet — start something first'],
    ['rate_limited', 'Slow down a little'],
    ['error', "Couldn't reach the server"],
  ] as const)('explains a "%s" result', async (result, message) => {
    vi.mocked(api.transferPlayback).mockResolvedValue(result);
    await connectState().transferTo(OTHER);
    expect(useToastStore.getState().message).toBe(message);
  });

  it.each(['ok', 'pending', 'noop'] as const)('stays quiet on "%s"', async (result) => {
    vi.mocked(api.transferPlayback).mockResolvedValue(result);
    await connectState().transferTo(OTHER);
    expect(useToastStore.getState().message).toBeNull();
  });

  it('renames this device: trims, caps at 40 characters, remembers it and tells the server', async () => {
    await connectState().renameThisDevice(`  ${'x'.repeat(60)}  `);

    expect(connectState().deviceName).toBe('x'.repeat(40));
    expect(localStorage.getItem('riffplayer-device-name')).toBe('x'.repeat(40));
    expect(api.renameDevice).toHaveBeenCalledWith(ME, 'x'.repeat(40));
  });

  it('keeps the new name locally even while offline, and ignores a blank one', async () => {
    useConnectStore.setState({ status: 'offline' });
    await connectState().renameThisDevice('Kitchen laptop');
    expect(connectState().deviceName).toBe('Kitchen laptop');
    expect(api.renameDevice).not.toHaveBeenCalled();

    await connectState().renameThisDevice('   ');
    expect(connectState().deviceName).toBe('Kitchen laptop');
  });
});

// ── The connection itself ────────────────────────────────────────────────────

interface FakeStream {
  response: Response;
  push: (text: string) => void;
  end: () => void;
  aborted: () => boolean;
}

const sse = (name: string, data: unknown, id = 1) => `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

function fakeStream(signal: AbortSignal, status = 200): FakeStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const encoder = new TextEncoder();
  let aborted = false;
  signal.addEventListener('abort', () => {
    aborted = true;
    try { controller.error(new DOMException('Aborted', 'AbortError')); } catch { /* already closed */ }
  });
  return {
    response: new Response(status === 200 ? body : null, { status }),
    push: (text) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
    aborted: () => aborted,
  };
}

describe('the connection loop', () => {
  let streams: FakeStream[];

  beforeEach(() => {
    streams = [];
    useConnectStore.setState({ status: 'idle' });
    vi.mocked(api.openStream).mockImplementation((_identity, signal) => {
      const s = fakeStream(signal);
      streams.push(s);
      return Promise.resolve(s.response);
    });
  });

  const hello = () => sse('hello', { serverTimeMs: Date.now(), you: ME }, 1);
  const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

  it('opens a stream with this device\'s identity and goes online on hello', async () => {
    connectState().start();
    expect(connectState().status).toBe('connecting');
    await tick();

    expect(api.openStream).toHaveBeenCalledWith({ deviceId: ME, name: 'My PC', type: 'web' }, expect.any(AbortSignal));
    streams[0].push(hello());
    await tick();
    expect(connectState().status).toBe('online');
  });

  it('handles events split across network chunks', async () => {
    connectState().start();
    await tick();
    const snapshot = sse('snapshot', { devices: [device(ME), device(OTHER)], activeDeviceId: null, state: null }, 2);

    streams[0].push(hello());
    streams[0].push(snapshot.slice(0, 20));
    await tick();
    expect(connectState().devices).toEqual([]);
    streams[0].push(snapshot.slice(20));
    await tick();

    expect(connectState().devices.map((d) => d.id)).toEqual([ME, OTHER]);
  });

  it('registers itself as the remote controller while running and removes itself on stop', async () => {
    connectState().start();
    expect(remoteRegistry.current).not.toBeNull();

    connectState().stop();

    expect(remoteRegistry.current).toBeNull();
    expect(connectState().status).toBe('idle');
    expect(connectState().devices).toEqual([]);
  });

  it('stop aborts the open stream, and starting twice does not open two', async () => {
    connectState().start();
    connectState().start();
    await tick();
    expect(api.openStream).toHaveBeenCalledTimes(1);

    connectState().stop();
    await tick();

    expect(streams[0].aborted()).toBe(true);
  });

  it('an older server without /connect hides the feature and stops trying', async () => {
    vi.mocked(api.openStream).mockImplementation((_i, signal) => Promise.resolve(fakeStream(signal, 404).response));
    connectState().start();
    await tick();
    await tick(60_000);

    expect(connectState().status).toBe('unavailable');
    expect(remoteRegistry.current).toBeNull();
    expect(api.openStream).toHaveBeenCalledTimes(1);
  });

  it('reconnects after the stream ends, waiting about a second first', async () => {
    connectState().start();
    await tick();
    streams[0].push(hello());
    await tick();

    streams[0].end();
    await tick();
    expect(connectState().status).toBe('offline');
    expect(api.openStream).toHaveBeenCalledTimes(1);

    await tick(1_300);
    expect(api.openStream).toHaveBeenCalledTimes(2);
  });

  it('backs off further while the server stays unreachable', async () => {
    vi.mocked(api.openStream).mockRejectedValue(new TypeError('Failed to fetch'));
    connectState().start();
    await tick();
    expect(api.openStream).toHaveBeenCalledTimes(1);

    await tick(1_300); // ~1 s
    expect(api.openStream).toHaveBeenCalledTimes(2);
    await tick(1_300); // second wait is ~2 s, so nothing yet
    expect(api.openStream).toHaveBeenCalledTimes(2);
    await tick(1_500);
    expect(api.openStream).toHaveBeenCalledTimes(3);
  });

  it('retries at once when the network comes back instead of waiting out the backoff', async () => {
    vi.mocked(api.openStream).mockRejectedValue(new TypeError('Failed to fetch'));
    connectState().start();
    await tick();
    await tick(1_300);
    expect(api.openStream).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('online'));
    await tick();

    expect(api.openStream).toHaveBeenCalledTimes(3);
  });

  it('aborts a stream that never says hello, and after two such attempts switches to long-polling', async () => {
    vi.mocked(api.pollOnce).mockReturnValue(new Promise(() => {}));
    connectState().start();
    await tick();

    await tick(8_100); // first silent stream aborted
    expect(streams[0].aborted()).toBe(true);
    expect(connectState().transport).toBe('stream');

    await tick(1_300); // reconnects
    expect(api.openStream).toHaveBeenCalledTimes(2);
    await tick(8_100); // second silent stream aborted

    expect(connectState().transport).toBe('poll');
    await tick(2_500);
    expect(api.pollOnce).toHaveBeenCalled();
  });

  it('a stream that goes quiet for 45 seconds (not even heartbeats) is treated as dead', async () => {
    connectState().start();
    await tick();
    streams[0].push(hello());
    await tick();

    await tick(50_000);

    expect(streams[0].aborted()).toBe(true);
  });

  it('heartbeats keep a quiet stream alive', async () => {
    connectState().start();
    await tick();
    streams[0].push(hello());
    for (let i = 0; i < 6; i++) {
      await tick(20_000);
      streams[0].push(': ping\n\n');
    }
    await tick();

    expect(streams[0].aborted()).toBe(false);
    expect(connectState().status).toBe('online');
  });

  it('a stream that stayed healthy resets the backoff for the next failure', async () => {
    connectState().start();
    await tick();
    streams[0].push(hello());
    await tick();
    for (let i = 0; i < 3; i++) { await tick(20_000); streams[0].push(': ping\n\n'); }
    streams[0].end();
    await tick();

    await tick(1_300);

    expect(api.openStream).toHaveBeenCalledTimes(2);
  });

  it('after earlier failures, one healthy connection brings the next retry back to about a second', async () => {
    const real = vi.mocked(api.openStream).getMockImplementation()!;
    vi.mocked(api.openStream)
      .mockRejectedValueOnce(new TypeError('down'))
      .mockRejectedValueOnce(new TypeError('down'))
      .mockRejectedValueOnce(new TypeError('down'))
      .mockImplementation(real);

    connectState().start();
    await tick();
    await tick(1_300); // 2nd attempt (after ~1 s)
    await tick(2_600); // 3rd attempt (after ~2 s)
    await tick(5_000); // 4th attempt (after ~4 s): the first one that connects
    expect(api.openStream).toHaveBeenCalledTimes(4);
    streams[0].push(hello());
    for (let i = 0; i < 3; i++) { await tick(20_000); streams[0].push(': ping\n\n'); }

    streams[0].end();
    await tick();
    await tick(1_300);

    expect(api.openStream).toHaveBeenCalledTimes(5);
  });

  it('does not keep re-reporting a queue it is only mirroring while another device plays', async () => {
    startOnline();
    otherIsPlaying();

    await vi.advanceTimersByTimeAsync(35_000);

    expect(api.reportState).not.toHaveBeenCalled();
  });

  describe('long-poll mode', () => {
    /** The real way in: two streams in a row that never say hello. */
    async function enterPollMode() {
      connectState().start();
      await tick();
      await tick(8_100);
      await tick(1_300);
      await tick(8_100);
      expect(connectState().transport).toBe('poll');
    }
    const ev = (seq: number, event: string, data: unknown) => ({ seq, event, data });

    it('registers with a first poll and keeps asking for events after the last sequence number it saw', async () => {
      vi.mocked(api.pollOnce)
        .mockResolvedValueOnce({ status: 200, events: [ev(1, 'hello', { serverTimeMs: Date.now(), you: ME }), ev(2, 'snapshot', { devices: [device(ME)], activeDeviceId: null, state: null })] })
        .mockResolvedValueOnce({ status: 200, events: [ev(3, 'devices', { devices: [device(ME), device(OTHER)], activeDeviceId: null })] })
        .mockReturnValue(new Promise(() => {}));

      await enterPollMode();
      await tick(2_500);

      expect(vi.mocked(api.pollOnce).mock.calls.map((c) => c[1])).toEqual([undefined, 2, 3]);
      expect(connectState().status).toBe('online');
      expect(connectState().devices.map((d) => d.id)).toEqual([ME, OTHER]);
    });

    it('a server without /connect ends polling and hides the feature', async () => {
      vi.mocked(api.pollOnce).mockResolvedValue({ status: 404, events: [] });

      await enterPollMode();
      await tick(2_500);

      expect(connectState().status).toBe('unavailable');
    });

    it('a refused poll (e.g. rate limited) goes offline and is retried later', async () => {
      vi.mocked(api.pollOnce).mockResolvedValue({ status: 429, events: [] });

      await enterPollMode();
      await tick(2_500);
      expect(connectState().status).toBe('offline');
      const first = vi.mocked(api.pollOnce).mock.calls.length;

      await tick(10_000);
      expect(vi.mocked(api.pollOnce).mock.calls.length).toBeGreaterThan(first);
    });
  });
});
