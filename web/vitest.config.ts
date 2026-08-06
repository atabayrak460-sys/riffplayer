import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default environment stays 'node' for the existing store/logic tests
    // (faster, and they never touch the DOM). Component tests (.test.tsx)
    // need a real DOM — opt into jsdom per-file with a
    // `// @vitest-environment jsdom` docblock rather than switching the
    // whole suite over, so the many pure-logic .test.ts files keep the
    // faster node environment.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
