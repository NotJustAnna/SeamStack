import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EXAMPLE_DIR, spawnSeam, type SeamProcess } from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

const PORT = 4567

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

describe('seam dev', () => {
  let dev: SeamProcess

  beforeAll(async () => {
    dev = spawnSeam(['dev'], { cwd: EXAMPLE_DIR })
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

  it('proxies /api/hello to the hono backend', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from hono' })
  })
})
