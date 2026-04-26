import { describe, expect, it } from 'vitest'
import { EXAMPLE_DIR, runSeam } from './helpers/spawn.js'

describe('seam plan', () => {
  it('--json describes the resolved topology', async () => {
    const result = await runSeam(['plan', '--json'], { cwd: EXAMPLE_DIR })
    expect(result.exitCode, result.all).toBe(0)
    const plan = JSON.parse(result.stdout) as {
      mode: string
      publicPort: number
      services: Array<{ framework: string; role: string; mountPath: string }>
      routing: Record<string, string>
    }
    expect(plan.publicPort).toBe(4567)
    expect(plan.routing).toEqual({ '/': 'vite', '/api': 'hono' })
    const roles = plan.services.map((s) => `${s.framework}:${s.role}`).sort()
    expect(roles).toEqual(['hono:asset-host', 'vite:asset-source'])
  })

  it('human-readable form mentions all phases', async () => {
    const result = await runSeam(['plan'], { cwd: EXAMPLE_DIR })
    expect(result.exitCode, result.all).toBe(0)
    expect(result.stdout).toContain('DEV')
    expect(result.stdout).toContain('BUILD')
    expect(result.stdout).toContain('START')
    expect(result.stdout).toContain('vite')
    expect(result.stdout).toContain('hono')
  })
})
