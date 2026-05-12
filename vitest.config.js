import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.js'],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 10000,
    silent: 'passed-only',
  },
});
