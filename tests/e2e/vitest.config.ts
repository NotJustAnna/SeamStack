import { defineConfig } from 'vitest/config'

const enabled = process.env.E2E === '1'

export default defineConfig({
  test: {
    include: enabled ? ['*.test.ts'] : [],
    testTimeout: 60_000,
    hookTimeout: 600_000,
    teardownTimeout: 60_000,
    globalSetup: enabled ? ['./global-setup.ts'] : [],
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
})
