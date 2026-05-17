import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EXAMPLE_DIR_FASTIFY,
  runSeam,
  spawnSeam,
  type SeamProcess,
} from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

const PORT = 4571
const DIST = join(EXAMPLE_DIR_FASTIFY, 'dist')

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

describe('seam dev (vite + fastify)', () => {
  let dev: SeamProcess

  beforeAll(async () => {
    dev = spawnSeam(['dev'], { cwd: EXAMPLE_DIR_FASTIFY })
    await waitForPort(PORT, 30_000)
    await waitForApiReady()
  }, 60_000)

  afterAll(async () => {
    await dev?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('serves the vite-rendered HTML at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    expect(await res.text()).toContain('<div id="root"></div>')
  })

  it('proxies /api/hello to the fastify backend', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from fastify' })
  })
})

describe('seam build → seam start (vite + fastify)', () => {
  let started: SeamProcess

  beforeAll(async () => {
    await rm(DIST, { recursive: true, force: true })
    const build = await runSeam(['build'], { cwd: EXAMPLE_DIR_FASTIFY })
    expect(build.exitCode, build.all).toBe(0)
    expect(existsSync(join(DIST, 'client', 'index.html'))).toBe(true)
    expect(existsSync(join(DIST, 'server', '_seam_prod.js'))).toBe(true)

    started = spawnSeam(['start'], { cwd: EXAMPLE_DIR_FASTIFY })
    await waitForPort(PORT, 30_000)
  }, 60_000)

  afterAll(async () => {
    await started?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('serves the built index.html at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    expect(await res.text()).toContain('<div id="root"></div>')
  })

  it('serves the API route', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from fastify' })
  })

  it('falls back to index.html on unknown SPA routes', async () => {
    const res = await fetch(`http://localhost:${PORT}/some/spa/route`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
    expect(await res.text()).toContain('<div id="root"></div>')
  })
})
