import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runSeam } from './helpers/spawn.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(HERE, 'fixtures')

describe('resolver error fixtures', () => {
  it('two-vites: rejects fabric with two asset-sources', async () => {
    const result = await runSeam(['plan'], { cwd: resolve(FIXTURES, 'two-vites') })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toMatch(/disambiguate/i)
    expect(result.stderr).toMatch(/defineStitch/)
  })

  it('no-host: rejects fabric with no asset-host', async () => {
    const result = await runSeam(['plan'], { cwd: resolve(FIXTURES, 'no-host') })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toMatch(/asset-producing AND one asset-hosting/i)
    expect(result.stderr).toMatch(/defineStitch/)
  })
})
