import { defineConfig } from 'vitest/config';

// Real-Postgres test layer (A5). Separate from the default pg-mem suite — runs
// only tests/realpg/** against a real Postgres (needs DATABASE_URL). Run with
// `npm run test:realpg` (see tests/realpg/setup.js for the connection note).
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/realpg/**/*.test.js'],
    setupFiles: ['./tests/realpg/setup.js'],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false, // single shared DB → serialize files
    testTimeout: 20000,
  },
});
