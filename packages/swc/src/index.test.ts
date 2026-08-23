import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import swcBuildTool from './index.js'

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'seam-swc-'))
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

describe('swc build tool', () => {
  it('mirror-compiles every file under the entry directory, leaving bare imports untouched', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = swcBuildTool()
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

  it('has no native watch — relies on the shared host-adapter fallback', () => {
    const tool = swcBuildTool()
    expect(tool.watch).toBeUndefined()
  })
})
