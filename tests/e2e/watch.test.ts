import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EXAMPLE_DIR_EXPRESS,
  spawnSeam,
  type SeamProcess,
} from './helpers/spawn.js'
import { waitForPort, waitForPortReleased } from './helpers/port.js'

const PORT = 4570
const ENTRY = join(EXAMPLE_DIR_EXPRESS, 'server', 'index.ts')

async function fetchHello(): Promise<string> {
  const res = await fetch(`http://localhost:${PORT}/api/hello`)
  if (res.status !== 200) throw new Error(`status ${res.status}`)
  const body = (await res.json()) as { msg: string }
  return body.msg
}

async function waitForMessage(expected: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last: unknown = null
  while (Date.now() < deadline) {
    try {
      if ((await fetchHello()) === expected) return
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `did not see message "${expected}" within ${timeoutMs}ms (last: ${String(last)})`,
  )
}

describe('seam dev hot-reload (tsx watch)', () => {
  let dev: SeamProcess
  let original = ''

  beforeAll(async () => {
    original = await readFile(ENTRY, 'utf8')
    dev = spawnSeam(['dev'], { cwd: EXAMPLE_DIR_EXPRESS })
    await waitForPort(PORT, 30_000)
    await waitForMessage('hi from express', 30_000)
  }, 60_000)

  afterAll(async () => {
    await writeFile(ENTRY, original, 'utf8')
    await dev?.kill()
    await waitForPortReleased(PORT, 10_000)
  }, 30_000)

  it('picks up edits to server entry and serves the new response', async () => {
    const updated = original.replace(
      "msg: 'hi from express'",
      "msg: 'hi from express (edited)'",
    )
    expect(updated).not.toBe(original)
    await writeFile(ENTRY, updated, 'utf8')
    await waitForMessage('hi from express (edited)', 20_000)
  }, 30_000)
})
