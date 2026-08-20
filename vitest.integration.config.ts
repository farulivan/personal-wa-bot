import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 15000,
    // Every file here talks to the same database and wipes it in beforeEach, so running them
    // side by side means one file deletes rows another is midway through asserting on. It
    // showed up as a shifting set of failures — seventeen one run, thirteen the next — that
    // vanished when a file was run on its own.
    fileParallelism: false,
  },
});
