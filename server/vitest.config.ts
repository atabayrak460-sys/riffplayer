import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Tests log in as admin/admin; production has no default password (a random
    // one is generated when RIFFPLAYER_ADMIN_PASSWORD is unset — see auth/seed.ts).
    env: { RIFFPLAYER_ADMIN_PASSWORD: 'admin' },
    // A stale local `dist/` (npm run build output, gitignored) can otherwise
    // get picked up alongside src/ and run compiled *.test.js against
    // whatever schema/code it was last built against — silently duplicating
    // and potentially contradicting the real src/ test results.
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
