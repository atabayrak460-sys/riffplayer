import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// This project doesn't enable Vitest's `globals: true`, so
// @testing-library/react can't auto-detect the test framework to register
// its usual automatic per-test cleanup — do it explicitly instead, or DOM
// nodes from one component test leak into the next.
afterEach(() => {
  cleanup();
});

// jsdom's own `window.localStorage` throws on access (Node's experimental
// implementation needs a `--localstorage-file`, which this project doesn't
// configure) — zustand's `persist` middleware (store/downloads.ts) treats
// that as "storage present but broken" rather than "no storage", so it
// still tries to call it and crashes any jsdom component test that renders
// something backed by a persisted store. A trivial in-memory stand-in is
// all `persist` actually needs for a test run.
if (typeof window !== 'undefined') {
  let store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { store = {}; },
    },
    writable: true,
  });

  // jsdom doesn't implement matchMedia at all — needed by useMediaQuery
  // (lib/useMediaQuery.ts), which ContextMenu uses to pick its mobile vs.
  // desktop layout. Every test gets "not matching" (desktop), which is fine
  // since no current test asserts on the mobile bottom-sheet variant.
  window.matchMedia = window.matchMedia ?? ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

  // jsdom doesn't implement ResizeObserver at all — @tanstack/react-virtual
  // (AllSongsPage, #57) uses it to measure the scroll container, and relies
  // on the callback firing at least once on observe() to get an initial
  // size (real ResizeObservers do this). jsdom has no real layout/resize
  // events to drive further callbacks, so this only ever fires once, at
  // observe() time, against whatever getBoundingClientRect currently
  // reports for that element — tests needing a specific container size
  // mock getBoundingClientRect before rendering.
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        const rect = target.getBoundingClientRect();
        this.callback(
          [{ target, contentRect: rect } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
}
