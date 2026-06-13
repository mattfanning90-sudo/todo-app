import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Scope to the server suite only. Without this, vitest's default glob
    // sweeps in ios-app/__tests__/* (jest + react-native), which it can't parse.
    // Non-recursive so the real-Postgres layer (tests/realpg/**, needs a real DB)
    // is excluded from this fast pg-mem suite — it runs via vitest.realpg.config.js.
    include: ['tests/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 10000,
    silent: false,
  },
});
