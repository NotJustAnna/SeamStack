import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevContext } from '@seamstack/core'

const { fakeWorkerModule, getState } = vi.hoisted(() => {
  // Imports are inlined inside the factory so vitest's hoisting doesn't trip
  // on top-level references that aren't yet initialised.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('node:events') as typeof import('node:events')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PassThrough } = require('node:stream') as typeof import('node:stream')

  const state: {
    lastWorkerData: Record<string, unknown> | undefined
    workers: FakeWorkerInst[]
  } = { lastWorkerData: undefined, workers: [] }

  class FakeWorkerInst extends EventEmitter {
    readonly stdout = new PassThrough()
    readonly stderr = new PassThrough()
    readonly postedMessages: unknown[] = []
    constructor(_url: URL, opts: { workerData?: Record<string, unknown> }) {
      super()
      state.lastWorkerData = opts.workerData
      state.workers.push(this)
      setImmediate(() => this.emit('message', { type: 'ready' }))
    }
    postMessage(msg: unknown): void {
      this.postedMessages.push(msg)
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { type?: string }).type === 'stop'
      ) {
        setImmediate(() => this.emit('exit', 0))
      }
    }
    async terminate(): Promise<number> {
      setImmediate(() => this.emit('exit', 0))
      return 0
    }
  }

  return {
    fakeWorkerModule: { Worker: FakeWorkerInst },
    getState: () => state,
  }
})

vi.mock('node:worker_threads', () => fakeWorkerModule)

const angularModulePromise = import('./adapter.js')

async function makeWorkspace(opts: {
  angularJson?: object | null
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'seam-angular-adapter-'))
  if (opts.angularJson !== null) {
    const json = opts.angularJson ?? {
      defaultProject: 'demo',
      projects: { demo: { architect: { build: { options: {} } } } },
    }
    await writeFile(join(root, 'angular.json'), JSON.stringify(json), 'utf8')
  }
  await mkdir(join(root, 'out'), { recursive: true })
  return root
}

function makeDevCtx(cwd: string, peers: DevContext['peers'] = []): DevContext {
  return {
    mode: 'dev',
    cwd,
    publicHost: 'localhost',
    publicPort: 4567,
    publicUrl: 'http://localhost:4567',
    assignedPort: 4567,
    peers,
    outDir: cwd,
  }
}

beforeEach(() => {
  const state = getState()
  state.lastWorkerData = undefined
  state.workers = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('angular adapter', () => {
  it('declares asset-source traits with / mount', async () => {
    const { default: angular } = await angularModulePromise
    const a = angular()
    expect(a.kind).toBe('serveable')
    expect(a.framework).toBe('angular')
    expect(a.traits).toEqual({
      producesAssets: true,
      canHostAssets: false,
      defaultMountPath: '/',
    })
  })

  it('dev() throws when angular.json is missing', async () => {
    const { default: angular } = await angularModulePromise
    const cwd = await makeWorkspace({ angularJson: null })
    const a = angular()
    await expect(a.dev(makeDevCtx(cwd))).rejects.toThrow(
      /angular\.json not found/,
    )
  })

  it('dev() throws when no project can be determined', async () => {
    const { default: angular } = await angularModulePromise
    const cwd = await makeWorkspace({ angularJson: { projects: {} } })
    const a = angular()
    await expect(a.dev(makeDevCtx(cwd))).rejects.toThrow(
      /could not determine Angular project/,
    )
  })

  it('writes a proxy config from asset-host peers and forwards it to the worker', async () => {
    const { default: angular } = await angularModulePromise
    const cwd = await makeWorkspace({})
    const a = angular()
    const peers: DevContext['peers'] = [
      {
        instance: {} as never,
        framework: 'hono',
        role: 'asset-host',
        mountPath: '/api',
        routes: ['/api'],
        devPort: 31000,
        prodPort: 0,
      },
    ]
    const handle = await a.dev(makeDevCtx(cwd, peers))

    const proxyPath = join(cwd, '_seam_angular_proxy.json')
    const content = JSON.parse(await readFile(proxyPath, 'utf8')) as Record<
      string,
      { target: string; ws: boolean; changeOrigin: boolean; secure: boolean }
    >
    expect(content['/api/**']).toEqual({
      target: 'http://127.0.0.1:31000',
      ws: true,
      changeOrigin: true,
      secure: false,
    })

    expect(getState().lastWorkerData).toMatchObject({
      project: 'demo',
      host: 'localhost',
      port: 4567,
      proxyConfig: proxyPath,
    })

    await handle.stop()
  })

  it('omits proxyConfig when there are no asset-host peers', async () => {
    const { default: angular } = await angularModulePromise
    const cwd = await makeWorkspace({})
    const a = angular()
    const handle = await a.dev(makeDevCtx(cwd, []))
    expect(getState().lastWorkerData?.['proxyConfig']).toBeNull()
    await handle.stop()
  })

  it('stop() posts {type:"stop"} and resolves on exit', async () => {
    const { default: angular } = await angularModulePromise
    const cwd = await makeWorkspace({})
    const a = angular()
    const handle = await a.dev(makeDevCtx(cwd))
    const worker = getState().workers[0]
    expect(worker).toBeDefined()
    await handle.stop()
    expect(worker!.postedMessages).toContainEqual({ type: 'stop' })
  })
})
