import { defineConfig } from 'vitest/config'

const enabled = process.env.MATRIX_E2E === '1'

export default defineConfig({
  test: {
    include: enabled ? ['matrix.test.ts'] : [],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    teardownTimeout: 60_000,
    globalSetup: enabled ? ['./global-setup.ts'] : [],
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: Number(process.env.MATRIX_WORKERS ?? 4),
        minThreads: 1,
      },
    },
    fileParallelism: true,
    bail: process.env.MATRIX_BAIL === '1' ? 1 : 0,
  },
})
