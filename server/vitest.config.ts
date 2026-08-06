import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // A stale local `dist/` (npm run build output, gitignored) can otherwise
    // get picked up alongside src/ and run compiled *.test.js against
    // whatever schema/code it was last built against — silently duplicating
    // and potentially contradicting the real src/ test results.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
