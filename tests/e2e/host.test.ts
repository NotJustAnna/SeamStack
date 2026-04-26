import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EXAMPLE_DIR,
  spawnSeam,
  type SeamProcess,
} from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

const PORT = 4567
const HOST = '127.0.0.1'

async function waitForApi(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${HOST}:${PORT}/api/hello`)
      if (res.status === 200) return
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`API not ready within ${timeoutMs}ms`)
}

describe('seam dev --host (vite + hono)', () => {
  let dev: SeamProcess

  beforeAll(async () => {
    dev = spawnSeam(['dev', '--host', HOST], { cwd: EXAMPLE_DIR })
    await waitForPort(PORT, 30_000)
    await waitForApi()
  }, 60_000)

  afterAll(async () => {
    await dev?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('serves frontend on the bound host', async () => {
    const res = await fetch(`http://${HOST}:${PORT}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/html')
  })

  it('proxies API to the backend on the bound host', async () => {
    const res = await fetch(`http://${HOST}:${PORT}/api/hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi from hono' })
  })
})
