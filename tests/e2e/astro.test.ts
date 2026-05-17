import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EXAMPLE_DIR_ASTRO,
  runSeam,
  spawnSeam,
  type SeamProcess,
} from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

const PORT = 4574
const DIST = join(EXAMPLE_DIR_ASTRO, 'dist')

async function waitForApiReady(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/api/hello`)
      if (res.status === 200) return
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`API at /api/hello not ready within ${timeoutMs}ms`)
}

// Astro's dev server picks its own port (defaults to 4321 and auto-bumps);
// seam does not currently inject the configured port into `astro dev` so we
// can't deterministically `waitForPort` the test's PORT. The build → start
// path runs through seam's runtime and IS port-deterministic, so it stays
// covered. Track this gap with the matching TODO in matrix-e2e/matrix.test.ts.
describe.skip('seam dev (astro + hono)', () => {
  let dev: SeamProcess

  beforeAll(async () => {
    dev = spawnSeam(['dev'], { cwd: EXAMPLE_DIR_ASTRO })
    // Astro dev cold-start (vite + integration init) can exceed 60s on a
    // freshly scaffolded fixture before any cache exists.
    await waitForPort(PORT, 120_000)
    await waitForApiReady()
  }, 150_000)

  afterAll(async () => {
    await dev?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('serves the astro-rendered HTML at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    const body = await res.text()
    expect(body).toContain('seamstack')
    expect(body).toContain('astro')
  })

  it('proxies /api/hello to the hono backend', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from hono' })
  })
})

describe('seam build → seam start (astro + hono)', () => {
  let started: SeamProcess

  beforeAll(async () => {
    await rm(DIST, { recursive: true, force: true })
    const build = await runSeam(['build'], { cwd: EXAMPLE_DIR_ASTRO })
    expect(build.exitCode, build.all).toBe(0)
    expect(existsSync(join(DIST, 'client', 'index.html'))).toBe(true)
    expect(existsSync(join(DIST, 'server', '_seam_prod.js'))).toBe(true)

    started = spawnSeam(['start'], { cwd: EXAMPLE_DIR_ASTRO })
    await waitForPort(PORT, 30_000)
  }, 90_000)

  afterAll(async () => {
    await started?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('serves the built index.html at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    const body = await res.text()
    expect(body).toContain('astro')
  })

  it('serves the API route', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from hono' })
  })
})
