import { describe, it, expect, afterEach, vi } from 'vitest';
import { isIOS } from './platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubNavigator(nav: Partial<Navigator>) {
  vi.stubGlobal('navigator', nav as Navigator);
}

describe('isIOS', () => {
  it('detects iPhone Safari', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it('detects iPadOS reporting itself as Mac with touch support', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it('detects Chrome on iOS (CriOS) — same WebKit engine, same eviction risk', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it('does not flag a real Mac desktop (no touch points)', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });

  it('does not flag Android', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(false);
  });

  it('does not flag desktop Windows', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });
});
