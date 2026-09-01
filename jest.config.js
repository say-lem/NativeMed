/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  // Test files live next to the code they cover, under src/modules/**/service/.
  // tests/ is just shared harness (setup, mocks, factories) — not a test root.
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/testSetup.ts'],
  transform: {
    // tsconfig.jest.json sets isolatedModules: true — transpile-only, no
    // full-program type-check per file. `npm run typecheck` already covers
    // that; doing it again per test file spun up the TS language service
    // against the whole project repeatedly and blew the default heap (OOM
    // on the very first run).
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  testTimeout: 30000,
  // Tests run serially against one shared in-memory Mongo instance — the
  // afterEach collection wipe in testSetup.ts would otherwise race with
  // parallel workers each mutating the same database.
  maxWorkers: 1,
};
