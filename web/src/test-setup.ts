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
