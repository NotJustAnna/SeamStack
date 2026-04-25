import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTsxArgs, createHostServeable } from './host-adapter.js'

const ENV_KEY = 'SEAM_INTERNAL__TEST_ADAPTER'

afterEach(() => {
  delete process.env[ENV_KEY]
})

function makeAdapter() {
  return createHostServeable({
    framework: 'test',
    defaultMountPath: '/api',
    entry: './server.ts',
    writeWireEnv(input) {
      return { [ENV_KEY]: JSON.stringify(input) }
    },
  })
}

describe('createHostServeable', () => {
  it('declares asset-host traits with the given mount path', () => {
    const adapter = createHostServeable({
      framework: 'test',
      defaultMountPath: '/svc',
      entry: './e.ts',
      writeWireEnv: () => ({}),
    })
    expect(adapter.kind).toBe('serveable')
    expect(adapter.framework).toBe('test')
    expect(adapter.traits).toEqual({
      producesAssets: false,
      canHostAssets: true,
      defaultMountPath: '/svc',
    })
  })

  it('rejects unsupported runtimes', () => {
    expect(() =>
      createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './e.ts',
        writeWireEnv: () => ({}),
        runtime: 'bun' as 'node',
      }),
    ).toThrow(/runtime 'bun' is not supported/)
  })

  it('build() writes _seam_prod.js with peer assets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-host-build-'))
    const adapter = makeAdapter()
    const result = await adapter.build({
      mode: 'prod',
      cwd: dir,
      publicHost: 'localhost',
      publicPort: 4567,
      publicUrl: 'http://localhost:4567',
      outDir: dir,
      peerOutputs: {
        vite: {
          assetsDir: '/abs/dist/client',
          indexHtml: '/abs/dist/client/index.html',
        },
      },
    })
    expect(result).toEqual({})
    const manifestPath = join(dir, '_seam_prod.js')
    const content = await readFile(manifestPath, 'utf8')
    expect(content).toContain('"assetsDir": "/abs/dist/client"')
    expect(content).toContain('"indexHtml": "/abs/dist/client/index.html"')
  })

  describe('buildTsxArgs', () => {
    it('returns just the entry when watch is undefined or false', () => {
      expect(buildTsxArgs('./e.ts', undefined)).toEqual(['./e.ts'])
      expect(buildTsxArgs('./e.ts', false)).toEqual(['./e.ts'])
    })

    it('uses `tsx watch` when watch is true', () => {
      expect(buildTsxArgs('./e.ts', true)).toEqual(['watch', './e.ts'])
    })

    it('passes include/exclude flags when given', () => {
      expect(
        buildTsxArgs('./e.ts', {
          include: ['./shared/**', './prisma/**'],
          exclude: ['./generated/**'],
        }),
      ).toEqual([
        'watch',
        '--include',
        './shared/**',
        '--include',
        './prisma/**',
        '--exclude',
        './generated/**',
        './e.ts',
      ])
    })

    it('emits --no-clear-screen only when explicitly disabled', () => {
      expect(buildTsxArgs('./e.ts', { clearScreen: false })).toEqual([
        'watch',
        '--no-clear-screen',
        './e.ts',
      ])
      expect(buildTsxArgs('./e.ts', { clearScreen: true })).toEqual([
        'watch',
        './e.ts',
      ])
      expect(buildTsxArgs('./e.ts', {})).toEqual(['watch', './e.ts'])
    })
  })

  it('build() throws when no peer has assetsDir+indexHtml', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'seam-host-build-'))
    const adapter = makeAdapter()
    await expect(
      adapter.build({
        mode: 'prod',
        cwd: dir,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        outDir: dir,
        peerOutputs: {},
      }),
    ).rejects.toThrow(/asset-source peer/)
  })
})
