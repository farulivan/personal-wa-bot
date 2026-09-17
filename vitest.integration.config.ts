import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    environment: 'node',
    // Starts a throwaway Postgres 18 for the run, unless TEST_DATABASE_URL is set.
    globalSetup: ['src/db/integrationGlobalSetup.ts'],
    testTimeout: 15000,
    // Every file here talks to the same database and wipes it in beforeEach, so running them
    // side by side means one file deletes rows another is midway through asserting on. It
    // showed up as a shifting set of failures — seventeen one run, thirteen the next — that
    // vanished when a file was run on its own.
    fileParallelism: false,
  },
});
