import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import rollupBuildTool from './index.js'

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'seam-rollup-'))
  const srcDir = join(dir, 'server')
  await mkdir(srcDir, { recursive: true })
  await writeFile(join(srcDir, 'helper.ts'), 'export const greeting = "hi from helper"\n')
  await writeFile(
    join(srcDir, 'index.ts'),
    [
      "import { greeting } from './helper'",
      "import { cwd } from 'node:process'",
      'console.log(greeting, typeof cwd)',
    ].join('\n'),
  )
  const serverDir = join(dir, 'dist-server')
  await mkdir(serverDir, { recursive: true })
  return { dir, srcDir, serverDir }
}

describe('rollup build tool', () => {
  it('bundles the entry, inlines local imports, and leaves bare imports external', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = rollupBuildTool()
    const result = await tool.build({
      entryPath: join(srcDir, 'index.ts'),
      serverDir,
      cwd: dir,
    })

    expect(result.entryPath).toBe(join(serverDir, 'index.js'))
    const content = await readFile(result.entryPath, 'utf8')
    expect(content).toContain('hi from helper')
    expect(content).toContain('node:process')
    expect(content).not.toContain("from './helper")
  })

  it('watch() rebuilds on file change and disposes cleanly', async () => {
    const { srcDir, serverDir, dir } = await makeFixture()
    const tool = rollupBuildTool()
    const rebuilds: string[] = []
    const handle = await tool.watch!(
      { entryPath: join(srcDir, 'index.ts'), serverDir, cwd: dir },
      (out) => rebuilds.push(out.entryPath),
    )
    try {
      // rollup's watcher performs its initial build asynchronously — under CI
      // load a single fixed sleep is flaky, so poll instead of racing a timer.
      const deadline = Date.now() + 10_000
      while (rebuilds.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50))
      }
      expect(rebuilds.length).toBeGreaterThan(0)
      const content = await readFile(join(serverDir, 'index.js'), 'utf8')
      expect(content).toContain('hi from helper')
    } finally {
      await handle.stop()
    }
  }, 15_000)
})
