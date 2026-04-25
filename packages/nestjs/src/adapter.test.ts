import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import nestjs from './adapter.js'

async function makeProject(opts: { withNestBin?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'seam-nestjs-adapter-'))
  if (opts.withNestBin) {
    const binDir = join(root, 'node_modules', '.bin')
    await mkdir(binDir, { recursive: true })
    await writeFile(join(binDir, 'nest'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  }
  return root
}

describe('nestjs adapter', () => {
  it('declares asset-host traits with /api mount path', () => {
    const a = nestjs()
    expect(a.kind).toBe('serveable')
    expect(a.framework).toBe('nestjs')
    expect(a.traits).toEqual({
      producesAssets: false,
      canHostAssets: true,
      defaultMountPath: '/api',
    })
  })

  it('rejects unsupported runtimes at construction', () => {
    expect(() => nestjs({ runtime: 'bun' as 'node' })).toThrow(
      /runtime 'bun' is not supported/,
    )
  })

  it('dev() throws when nest CLI binary is missing', async () => {
    const cwd = await makeProject()
    const a = nestjs()
    await expect(
      a.dev({
        mode: 'dev',
        cwd,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        assignedPort: 30000,
        peers: [],
        outDir: cwd,
      }),
    ).rejects.toThrow(/`nest` CLI not found/)
  })

  it('build() throws when nest CLI binary is missing', async () => {
    const cwd = await makeProject()
    const a = nestjs()
    await expect(
      a.build({
        mode: 'prod',
        cwd,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        outDir: cwd,
        peerOutputs: {
          vite: { assetsDir: '/abs/dist/client', indexHtml: '/abs/dist/client/index.html' },
        },
      }),
    ).rejects.toThrow(/`nest` CLI not found/)
  })

  it('build() requires an asset-source peer', async () => {
    const cwd = await makeProject({ withNestBin: true })
    const a = nestjs()
    await expect(
      a.build({
        mode: 'prod',
        cwd,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        outDir: cwd,
        peerOutputs: {},
      }),
    ).rejects.toThrow(/asset-source peer/)
  })

  it('start() throws when compiled entry is missing (no `seam build` ran)', async () => {
    const cwd = await makeProject()
    const a = nestjs()
    await expect(
      a.start({
        mode: 'prod',
        cwd,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        assignedPort: 30000,
        peers: [],
        outDir: cwd,
      }),
    ).rejects.toThrow(/compiled entry not found/)
  })

  it('start() respects nest-cli.json `entryFile` and outDir', async () => {
    const cwd = await makeProject()
    await writeFile(
      join(cwd, 'nest-cli.json'),
      JSON.stringify({ entryFile: 'bootstrap', compilerOptions: { outDir: 'build' } }),
      'utf8',
    )
    const a = nestjs()
    await expect(
      a.start({
        mode: 'prod',
        cwd,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        assignedPort: 30000,
        peers: [],
        outDir: cwd,
      }),
    ).rejects.toThrow(/build[\/\\]bootstrap\.js/)
  })
})
