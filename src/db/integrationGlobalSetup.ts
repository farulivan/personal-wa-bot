import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Production runs Postgres 18, and the majors really do behave differently here:
// issue #79 only shows up on 18. Testing against anything else proves less.
const POSTGRES_IMAGE = 'postgres:18';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

// Runs once before any integration file. The suite used to depend on a database created
// by hand and a TEST_DATABASE_URL that nothing set, so a plain `pnpm test:integration`
// skipped every test. It now starts a throwaway container on a free port and removes it
// afterwards. TEST_DATABASE_URL still wins when it is set, for running against a database
// you already have.
export default async function setup(project: TestProject): Promise<void | (() => Promise<void>)> {
  const existingUrl = process.env.TEST_DATABASE_URL;
  if (existingUrl) {
    project.provide('testDatabaseUrl', existingUrl);
    return;
  }

  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start().catch((err: unknown) => {
    throw new Error(
      `Could not start a ${POSTGRES_IMAGE} container for the integration tests. Is Docker running? ` +
        'To use an existing database instead, set TEST_DATABASE_URL, knowing the tests clear its data.',
      { cause: err }
    );
  });
  project.provide('testDatabaseUrl', container.getConnectionUri());

  return async () => {
    await container.stop();
  };
}
