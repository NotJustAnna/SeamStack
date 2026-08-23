import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import tsc from './index.js'

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'seam-tsc-'))
  const srcDir = join(dir, 'server')
  await mkdir(srcDir, { recursive: true })
  await writeFile(join(srcDir, 'helper.ts'), 'export const greeting = "hi from helper"\n')
  await writeFile(
    join(srcDir, 'index.ts'),
    [
      "import { greeting } from './helper.js'",
      "import { cwd } from 'node:process'",
      'console.log(greeting, typeof cwd)',
    ].join('\n'),
  )
  const serverDir = join(dir, 'dist-server')
  await mkdir(serverDir, { recursive: true })
  return { dir, srcDir, serverDir }
}

describe('tsc build tool', () => {
  it('mirror-compiles every file under the entry directory, leaving bare imports untouched', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = tsc()
    const result = await tool.build({
      entryPath: join(srcDir, 'index.ts'),
      serverDir,
      cwd: dir,
    })

    expect(result.entryPath).toBe(join(serverDir, 'index.js'))
    const entryContent = await readFile(result.entryPath, 'utf8')
    expect(entryContent).toContain('node:process')
    expect(entryContent).toContain('./helper')

    const helperContent = await readFile(join(serverDir, 'helper.js'), 'utf8')
    expect(helperContent).toContain('hi from helper')
  })

  it('rejects a non-TS entry — tsc compiles TS, it does not bundle plain JS', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-tsc-js-'))
    const srcDir = join(dir, 'server')
    await mkdir(srcDir, { recursive: true })
    await writeFile(join(srcDir, 'index.js'), 'export const greeting = "hi from plain js"\n')
    const serverDir = join(dir, 'dist-server')
    await mkdir(serverDir, { recursive: true })

    const tool = tsc()
    await expect(
      tool.build({ entryPath: join(srcDir, 'index.js'), serverDir, cwd: dir }),
    ).rejects.toThrow(/not a TypeScript file/)
  })

  it('watch() rebuilds on file change and disposes cleanly', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = tsc()
    const rebuilds: string[] = []
    const handle = await tool.watch!(
      { entryPath: join(srcDir, 'index.ts'), serverDir, cwd: dir },
      (out) => rebuilds.push(out.entryPath),
    )
    try {
      await new Promise((r) => setTimeout(r, 500))
      expect(rebuilds.length).toBeGreaterThan(0)
    } finally {
      handle.stop()
    }
  })
})
