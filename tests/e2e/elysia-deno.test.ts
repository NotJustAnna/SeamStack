import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EXAMPLE_DIR_ELYSIA_DENO,
  runSeam,
  spawnSeam,
  type SeamProcess,
} from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

// Regression coverage for the concrete bug found manually this session: an
// Elysia backend scaffolded with `runtime: 'deno'` must take its Deno-native
// branch (`Deno.serve(app.fetch)`, no adapter) — the old unconditional
// `@elysiajs/node` adapter crashes outright under Deno
// (`Unstable API 'Deno.listen({ reusePort: true })'`).
const PORT = 4576
const DIST = join(EXAMPLE_DIR_ELYSIA_DENO, 'dist')

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

describe('seam dev (vite + elysia, runtime: deno)', () => {
  let dev: SeamProcess

  beforeAll(async () => {
    dev = spawnSeam(['dev'], { cwd: EXAMPLE_DIR_ELYSIA_DENO })
    await waitForPort(PORT, 30_000)
    await waitForApiReady()
  }, 60_000)

  afterAll(async () => {
    await dev?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('proxies /api/hello to the elysia backend', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from elysia' })
  })
})

describe('seam build → seam start (vite + elysia, runtime: deno)', () => {
  let started: SeamProcess

  beforeAll(async () => {
    await rm(DIST, { recursive: true, force: true })
    const build = await runSeam(['build'], { cwd: EXAMPLE_DIR_ELYSIA_DENO })
    expect(build.exitCode, build.all).toBe(0)
    expect(existsSync(join(DIST, 'client', 'index.html'))).toBe(true)

    started = spawnSeam(['start'], { cwd: EXAMPLE_DIR_ELYSIA_DENO })
    await waitForPort(PORT, 30_000)
    await waitForApiReady()
  }, 60_000)

  afterAll(async () => {
    await started?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('serves the API route', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from elysia' })
  })
})
