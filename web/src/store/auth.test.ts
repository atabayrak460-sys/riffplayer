// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from './auth';

function mockLoginOk() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token: 'jwt-token', user: { id: 1, username: 'admin', role: 'admin' } }),
  }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  useAuthStore.setState({ credentials: null, token: null, user: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth store persistence (#23)', () => {
  // Node 22 + jsdom's test environment has a known quirk where
  // window.localStorage is undefined (Node's own experimental global
  // localStorage shadows jsdom's), so there's no reliable way to assert
  // "and it's absent from localStorage" here — real browsers always have
  // both. The meaningful assertion is that sessionStorage actually receives
  // the data: nothing else in this test writes there, so this alone proves
  // the persist middleware is sessionStorage-backed, not defaulting to
  // localStorage as it did before this fix.
  it('persists credentials to sessionStorage', async () => {
    mockLoginOk();
    await useAuthStore.getState().login({ serverUrl: 'http://localhost:4533', username: 'admin', password: 'secret' });

    const stored = window.sessionStorage.getItem('cadence-auth');
    expect(stored).not.toBeNull();
    expect(stored).toContain('secret');
  });

  it('logout clears the persisted state, not just in-memory state', async () => {
    mockLoginOk();
    await useAuthStore.getState().login({ serverUrl: 'http://localhost:4533', username: 'admin', password: 'secret' });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().credentials).toBeNull();
    expect(window.sessionStorage.getItem('cadence-auth')).not.toContain('secret');
  });

  it('does not persist anything on a failed login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Wrong credentials' }),
    }));

    await expect(
      useAuthStore.getState().login({ serverUrl: 'http://localhost:4533', username: 'admin', password: 'wrong' }),
    ).rejects.toThrow('Wrong credentials');

    expect(useAuthStore.getState().credentials).toBeNull();
    expect(window.sessionStorage.getItem('cadence-auth')).not.toContain('wrong');
  });
});
