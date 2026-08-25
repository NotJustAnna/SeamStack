import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import rolldownBuildTool from './index.js'

const execFileAsync = promisify(execFile)

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'seam-rolldown-'))
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

describe('rolldown build tool', () => {
  it('bundles the entry, inlines local imports, and leaves bare imports external', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = rolldownBuildTool()
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

  it('passes `output` options through to the write step (e.g. codeSplitting for bundled dynamic imports)', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    await writeFile(join(srcDir, 'dynamic.ts'), 'export const value = "hi from dynamic"\n')
    await writeFile(
      join(srcDir, 'index.ts'),
      [
        "const mod = await import('./dynamic.js')",
        'console.log(mod.value)',
      ].join('\n'),
    )

    // A dynamic import makes rolldown want to code-split into multiple
    // chunks, which conflicts with the buildTool's single-file `output.file`
    // contract unless the caller opts out via `output.codeSplitting: false`.
    const tool = rolldownBuildTool({ output: { codeSplitting: false } })
    const result = await tool.build({
      entryPath: join(srcDir, 'index.ts'),
      serverDir,
      cwd: dir,
    })

    const content = await readFile(result.entryPath, 'utf8')
    expect(content).toContain('hi from dynamic')
  })

  it('produces output that actually runs — a bundled CJS dep requiring a Node builtin does not crash', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    // Mimics a real-world transitive CJS dependency (e.g. readable-stream)
    // that does `require('node:events')` internally. Without `platform:
    // 'node'`, rolldown defaults to a browser platform for esm output,
    // which leaves this as a runtime `require()` call with no `require`
    // available in Node ESM — a crash only visible by actually executing
    // the bundle, not by inspecting its source.
    await writeFile(
      join(srcDir, 'vendor.cjs'),
      [
        "const { EventEmitter } = require('node:events')",
        'module.exports.makeEmitter = () => new EventEmitter()',
      ].join('\n'),
    )
    await writeFile(
      join(srcDir, 'index.ts'),
      [
        "import { makeEmitter } from './vendor.cjs'",
        'console.log("emitter ok:", typeof makeEmitter().on)',
      ].join('\n'),
    )

    const tool = rolldownBuildTool()
    const result = await tool.build({
      entryPath: join(srcDir, 'index.ts'),
      serverDir,
      cwd: dir,
    })

    const { stdout } = await execFileAsync(process.execPath, [result.entryPath])
    expect(stdout).toContain('emitter ok: function')
  })

  it('watch() rebuilds on file change and disposes cleanly', async () => {
    const { srcDir, serverDir, dir } = await makeFixture()
    const tool = rolldownBuildTool()
    const rebuilds: string[] = []
    const handle = await tool.watch!(
      { entryPath: join(srcDir, 'index.ts'), serverDir, cwd: dir },
      (out) => rebuilds.push(out.entryPath),
    )
    try {
      // The watcher's initial build is asynchronous — under CI load a single
      // fixed sleep is flaky, so poll instead of racing a timer.
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
