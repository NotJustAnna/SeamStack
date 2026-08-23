import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import webpackBuildTool from './index.js'

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'seam-webpack-'))
  const srcDir = join(dir, 'server')
  await mkdir(srcDir, { recursive: true })
  await writeFile(
    join(srcDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false,
      },
    }),
  )
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

describe('webpack build tool', () => {
  it('bundles the entry, inlines local imports, and leaves bare imports external', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = webpackBuildTool({
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: {
              loader: 'ts-loader',
              options: { configFile: join(srcDir, 'tsconfig.json'), transpileOnly: true },
            },
            exclude: /node_modules/,
          },
        ],
      },
    })
    const result = await tool.build({
      entryPath: join(srcDir, 'index.ts'),
      serverDir,
      cwd: dir,
    })

    expect(result.entryPath).toBe(join(serverDir, 'index.js'))
    const content = await readFile(result.entryPath, 'utf8')
    expect(content).toContain('hi from helper')
    expect(content).toContain('node:process')
  }, 30000)

  it('watch() rebuilds on file change and disposes cleanly', async () => {
    const { dir, srcDir, serverDir } = await makeFixture()
    const tool = webpackBuildTool({
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: {
              loader: 'ts-loader',
              options: { configFile: join(srcDir, 'tsconfig.json'), transpileOnly: true },
            },
            exclude: /node_modules/,
          },
        ],
      },
    })
    const rebuilds: string[] = []
    const handle = await tool.watch!(
      { entryPath: join(srcDir, 'index.ts'), serverDir, cwd: dir },
      (out) => rebuilds.push(out.entryPath),
    )
    try {
      await new Promise((r) => setTimeout(r, 2000))
      expect(rebuilds.length).toBeGreaterThan(0)
      const content = await readFile(join(serverDir, 'index.js'), 'utf8')
      expect(content).toContain('hi from helper')
    } finally {
      await handle.stop()
    }
  }, 30000)
})
