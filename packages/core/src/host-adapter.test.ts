import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BuildTool } from './build-tool.js'
import { buildTsxArgs, createHostServeable } from './host-adapter.js'

const ENV_KEY = 'SEAM_INTERNAL__TEST_ADAPTER'

const execaCalls: Array<{ bin: string; args: string[]; cwd?: string }> = []

vi.mock('execa', () => ({
  execa: vi.fn((bin: string, args: string[], options: { cwd?: string }) => {
    execaCalls.push({ bin, args, cwd: options.cwd })
    const child = {
      stdout: null,
      stderr: null,
      pid: 4242,
      killed: false,
      catch: () => child,
    }
    return child
  }),
}))

// Real resolution can't reliably simulate "tsx isn't installed" in this test
// environment — vitest itself sets NODE_PATH to a hoisted pnpm dir that
// happens to contain tsx (a repo devDependency), and Node bakes NODE_PATH's
// global search paths in once at boot, so deleting the env var mid-test has
// no effect. Force it deterministically via this flag instead.
let forceTsxUnresolvable = false
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>()
  return {
    ...actual,
    createRequire: (...args: Parameters<typeof actual.createRequire>) => {
      const req = actual.createRequire(...args)
      if (!forceTsxUnresolvable) return req
      const fake = ((id: string) => req(id)) as unknown as NodeJS.Require
      fake.resolve = ((id: string) => {
        const err = new Error(`Cannot find module '${id}'`) as NodeJS.ErrnoException
        err.code = 'MODULE_NOT_FOUND'
        throw err
      }) as unknown as NodeJS.RequireResolve
      return fake
    },
  }
})

afterEach(() => {
  delete process.env[ENV_KEY]
  execaCalls.length = 0
  forceTsxUnresolvable = false
})

function makeAdapter() {
  return createHostServeable({
    framework: 'test',
    defaultMountPath: '/api',
    entry: './server.js',
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

  it('accepts every Runner as a runtime, including non-node ones', () => {
    for (const runtime of ['tsx', 'node', 'bun', 'nub', 'deno'] as const) {
      expect(() =>
        createHostServeable({
          framework: 'test',
          defaultMountPath: '/api',
          entry: './e.ts',
          writeWireEnv: () => ({}),
          runtime,
        }),
      ).not.toThrow()
    }
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
          assetsDir: join(dir, 'client'),
          indexHtml: join(dir, 'client', 'index.html'),
        },
      },
    })
    expect(result).toEqual({})
    const manifestPath = join(dir, 'server', '_seam_prod.js')
    const content = await readFile(manifestPath, 'utf8')
    expect(content).toContain('"assetsDir": "../client"')
    expect(content).toContain('"indexHtml": "../client/index.html"')
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

  describe('buildTool / runtime', () => {
    function makeBuildCtx(dir: string) {
      return {
        mode: 'prod' as const,
        cwd: dir,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        outDir: dir,
        peerOutputs: {
          vite: {
            assetsDir: join(dir, 'client'),
            indexHtml: join(dir, 'client', 'index.html'),
          },
        },
      }
    }

    function makeStartCtx(dir: string) {
      return {
        mode: 'prod' as const,
        cwd: dir,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        outDir: dir,
        assignedPort: 4567,
        peers: [],
      }
    }

    function makeDevCtx(dir: string) {
      return {
        mode: 'dev' as const,
        cwd: dir,
        publicHost: 'localhost',
        publicPort: 4567,
        publicUrl: 'http://localhost:4567',
        assignedPort: 4567,
        peers: [],
        outDir: dir,
      }
    }

    async function stubTsxAsResolvable(dir: string): Promise<void> {
      const pkgDir = join(dir, 'node_modules', 'tsx')
      await mkdir(pkgDir, { recursive: true })
      await writeFile(join(pkgDir, 'package.json'), '{"name":"tsx","version":"0.0.0"}', 'utf8')
    }

    function fakeCompilingTool(): BuildTool {
      return {
        name: 'fake',
        async build(ctx) {
          const entryPath = join(ctx.serverDir, 'index.js')
          await mkdir(ctx.serverDir, { recursive: true })
          await writeFile(entryPath, '// compiled\n', 'utf8')
          return { entryPath }
        },
      }
    }

    it('build() with no buildTool writes no serverEntry (deliberate no-build default)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-build-'))
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
      })
      await adapter.build(makeBuildCtx(dir))
      const content = await readFile(join(dir, 'server', '_seam_prod.js'), 'utf8')
      expect(content).not.toContain('serverEntry')
    })

    it('build() with a buildTool records the relative serverEntry in the manifest', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-build-'))
      const fakeTool: BuildTool = {
        name: 'fake',
        async build(ctx) {
          expect(ctx.entryPath).toBe(join(dir, 'server.ts'))
          expect(ctx.serverDir).toBe(join(dir, 'server'))
          return { entryPath: join(ctx.serverDir, 'index.js') }
        },
      }
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        buildTool: fakeTool,
      })
      await adapter.build(makeBuildCtx(dir))
      const content = await readFile(join(dir, 'server', '_seam_prod.js'), 'utf8')
      expect(content).toContain('"serverEntry": "index.js"')
    })

    it('start() with no buildTool always spawns tsx against the raw entry, no existsSync check', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      await stubTsxAsResolvable(dir)
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
      })
      const handle = await adapter.start(makeStartCtx(dir))
      await handle.stop()
      expect(execaCalls).toEqual([
        { bin: 'tsx', args: [join(dir, 'server.ts')], cwd: dir },
      ])
    })

    it('throws a clear error instead of spawning tsx when it is not resolvable', async () => {
      forceTsxUnresolvable = true
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
      })
      await expect(adapter.start(makeStartCtx(dir))).rejects.toThrow(/tsx not found/)
      expect(execaCalls).toEqual([])
    })

    it('start() throws when buildTool is set but the compiled entry is missing', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        buildTool: { name: 'fake', build: async (ctx) => ({ entryPath: ctx.entryPath }) },
      })
      await expect(adapter.start(makeStartCtx(dir))).rejects.toThrow(/run `seam build` first/)
      expect(execaCalls).toEqual([])
    })

    it('start() throws when the manifest is stale — serverEntry recorded but the file is gone', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        buildTool: fakeCompilingTool(),
      })
      await adapter.build(makeBuildCtx(dir))
      const { unlink } = await import('node:fs/promises')
      await unlink(join(dir, 'server', 'index.js'))
      await expect(adapter.start(makeStartCtx(dir))).rejects.toThrow(/run `seam build` first/)
      expect(execaCalls).toEqual([])
    })

    it('start() with buildTool set spawns node against the manifest serverEntry, cwd at project root', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        buildTool: fakeCompilingTool(),
      })
      await adapter.build(makeBuildCtx(dir))
      const handle = await adapter.start(makeStartCtx(dir))
      await handle.stop()
      expect(execaCalls).toEqual([
        { bin: 'node', args: [join(dir, 'server', 'index.js')], cwd: dir },
      ])
    })

    it('runtime overrides the default runner in both the compiled and uncompiled paths', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      const uncompiled = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        runtime: 'bun',
      })
      await uncompiled.start(makeStartCtx(dir))
      expect(execaCalls).toEqual([{ bin: 'bun', args: ['run', join(dir, 'server.ts')], cwd: dir }])
      execaCalls.length = 0

      const compiled = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        buildTool: fakeCompilingTool(),
        runtime: 'bun',
      })
      await compiled.build(makeBuildCtx(dir))
      await compiled.start(makeStartCtx(dir))
      expect(execaCalls).toEqual([
        { bin: 'bun', args: ['run', join(dir, 'server', 'index.js')], cwd: dir },
      ])
    })

    it('devRuntime is independent of runtime — dev and start can use different runners entirely', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
      const adapter = createHostServeable({
        framework: 'test',
        defaultMountPath: '/api',
        entry: './server.ts',
        writeWireEnv: () => ({}),
        buildTool: fakeCompilingTool(),
        devRuntime: 'nub',
        // runtime left unset — should still default to 'node' for the compiled start() path,
        // completely unaffected by devRuntime.
      })
      const devHandle = await adapter.dev(makeDevCtx(dir))
      await devHandle.stop()
      expect(execaCalls).toEqual([{ bin: 'nub', args: ['run', join(dir, 'server.ts')], cwd: dir }])
      execaCalls.length = 0

      await adapter.build(makeBuildCtx(dir))
      await adapter.start(makeStartCtx(dir))
      expect(execaCalls).toEqual([{ bin: 'node', args: [join(dir, 'server', 'index.js')], cwd: dir }])
    })

    describe('ambient runner detection', () => {
      const UA_KEY = 'npm_config_user_agent'
      const originalUa = process.env[UA_KEY]

      afterEach(() => {
        if (originalUa === undefined) delete process.env[UA_KEY]
        else process.env[UA_KEY] = originalUa
      })

      it('dev() defaults to the ambient runner (via npm_config_user_agent) over tsx when devRuntime is unset', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
        process.env[UA_KEY] = 'bun/1.2.3 npm/? node/v20'
        const adapter = createHostServeable({
          framework: 'test',
          defaultMountPath: '/api',
          entry: './server.ts',
          writeWireEnv: () => ({}),
        })
        const handle = await adapter.dev(makeDevCtx(dir))
        await handle.stop()
        expect(execaCalls).toEqual([{ bin: 'bun', args: ['run', join(dir, 'server.ts')], cwd: dir }])
      })

      it('start()\'s uncompiled path also defaults to the ambient runner', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
        process.env[UA_KEY] = 'nub/0.1.0'
        const adapter = createHostServeable({
          framework: 'test',
          defaultMountPath: '/api',
          entry: './server.ts',
          writeWireEnv: () => ({}),
        })
        const handle = await adapter.start(makeStartCtx(dir))
        await handle.stop()
        expect(execaCalls).toEqual([{ bin: 'nub', args: ['run', join(dir, 'server.ts')], cwd: dir }])
      })

      it('an explicit devRuntime/runtime always wins over ambient detection', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
        process.env[UA_KEY] = 'bun/1.2.3'
        const adapter = createHostServeable({
          framework: 'test',
          defaultMountPath: '/api',
          entry: './server.ts',
          writeWireEnv: () => ({}),
          devRuntime: 'tsx',
        })
        const handle = await adapter.dev(makeDevCtx(dir))
        await handle.stop()
        expect(execaCalls).toEqual([{ bin: 'tsx', args: ['watch', join(dir, 'server.ts')], cwd: dir }])
      })

      it('ambient bun/deno also becomes the compiled start() default (real engines, not just node)', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
        process.env[UA_KEY] = 'bun/1.2.3'
        const adapter = createHostServeable({
          framework: 'test',
          defaultMountPath: '/api',
          entry: './server.ts',
          writeWireEnv: () => ({}),
          buildTool: fakeCompilingTool(),
        })
        await adapter.build(makeBuildCtx(dir))
        const handle = await adapter.start(makeStartCtx(dir))
        await handle.stop()
        expect(execaCalls).toEqual([
          { bin: 'bun', args: ['run', join(dir, 'server', 'index.js')], cwd: dir },
        ])
      })

      it('ambient nub does not override the compiled start() default — it is just node underneath', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'seam-host-start-'))
        process.env[UA_KEY] = 'nub/0.1.0'
        const adapter = createHostServeable({
          framework: 'test',
          defaultMountPath: '/api',
          entry: './server.ts',
          writeWireEnv: () => ({}),
          buildTool: fakeCompilingTool(),
        })
        await adapter.build(makeBuildCtx(dir))
        const handle = await adapter.start(makeStartCtx(dir))
        await handle.stop()
        expect(execaCalls).toEqual([{ bin: 'node', args: [join(dir, 'server', 'index.js')], cwd: dir }])
      })
    })
  })
})
