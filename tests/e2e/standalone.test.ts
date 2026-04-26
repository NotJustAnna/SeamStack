import { execa, type ResultPromise } from 'execa'
import { describe, expect, it } from 'vitest'
import { EXAMPLE_DIR } from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

async function killAndWait(proc: ResultPromise<{ reject: false }>): Promise<void> {
  if (proc.killed) return
  proc.kill('SIGTERM')
  const force = setTimeout(() => {
    try {
      proc.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }, 2000)
  try {
    await proc
  } catch {
    /* expected */
  } finally {
    clearTimeout(force)
  }
}

describe('standalone behavior (outside seam)', () => {
  it('vite alone logs the no-wire warning', async () => {
    const proc = execa('pnpm', ['exec', 'vite', '--port', '5179'], {
      cwd: EXAMPLE_DIR,
      reject: false,
      all: true,
    }) as ResultPromise<{ reject: false }>
    proc.catch(() => {
      /* expected */
    })

    try {
      await waitForPort(5179, 20_000)
      // Read from buffered stdout — execa buffers `all` until kill.
      proc.kill('SIGTERM')
      const result = await proc.catch(() => proc)
      const all = (result.all as string | undefined) ?? ''
      expect(all).toMatch(/SEAM_INTERNAL__VITE_ADAPTER/)
      expect(all).toMatch(/standalone/)
    } finally {
      await killAndWait(proc)
      await waitForPortReleased(5179, 10_000)
    }
  }, 40_000)

  it('hono server alone (no _seam_prod.js) returns 404 on / and 200 on /api/hello', async () => {
    const proc = execa('pnpm', ['exec', 'tsx', 'server/index.ts'], {
      cwd: EXAMPLE_DIR,
      env: { ...process.env, PORT: '5180' },
      reject: false,
      all: true,
    }) as ResultPromise<{ reject: false }>
    proc.catch(() => {
      /* expected */
    })

    try {
      await waitForPort(5180, 20_000)
      const root = await fetch('http://localhost:5180/')
      expect(root.status).toBe(404)
      const api = await fetch('http://localhost:5180/api/hello')
      expect(api.status).toBe(200)
      expect(await api.json()).toEqual({ msg: 'hi from hono' })
    } finally {
      await killAndWait(proc)
      await waitForPortReleased(5180, 10_000)
    }
  }, 40_000)
})
