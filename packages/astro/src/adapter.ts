import { join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import {
  wrapStream,
  type Serveable,
  type DevContext,
  type DevHandle,
  type BuildContext,
  type BuildOutput,
  type StartContext,
  type StartHandle,
} from '@seamstack/core'
import { ASTRO_WIRE_ENV, writeAstroWire } from './wire.js'

const ASTRO_WORKER_URL = new URL('./astro-worker.js', import.meta.url)

export interface AstroAdapterOptions {
  /**
   * Path to the Astro project root (where `astro.config.*` lives), resolved
   * relative to the seam project root. Defaults to `'.'`.
   *
   * Use this when your client lives in a subdirectory (e.g. `'./client'`).
   */
  readonly root?: string
}

/**
 * Astro asset-source adapter.
 *
 * Runs Astro's dev server in `seam dev` and produces a static client bundle in
 * `seam build`. Pair with any asset-host — the host serves the built bundle
 * in `seam start`.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import astro from '@seamstack/astro/adapter'
 * import hono from '@seamstack/hono/adapter'
 *
 * export default defineWeave({
 *   fabric: [astro({ root: './client' }), hono({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function astro(opts: AstroAdapterOptions = {}): Serveable {
  const resolveRoot = (cwd: string) => (opts.root ? resolve(cwd, opts.root) : cwd)

  return {
    kind: 'serveable',
    framework: 'astro',
    traits: {
      producesAssets: true,
      canHostAssets: false,
      defaultMountPath: '/',
    },
    async dev(ctx: DevContext): Promise<DevHandle> {
      const root = resolveRoot(ctx.cwd)

      const proxy: Record<string, string> = {}
      for (const peer of ctx.peers) {
        if (peer.role !== 'asset-host') continue
        for (const route of peer.routes) {
          proxy[route] = `http://127.0.0.1:${peer.devPort}`
        }
      }

      const wireEnv = writeAstroWire({
        mode: ctx.mode,
        host: ctx.publicHost,
        port: ctx.assignedPort,
        ...(Object.keys(proxy).length > 0 ? { proxy } : {}),
      })

      const worker = new Worker(ASTRO_WORKER_URL, {
        workerData: { root, wireEnvKey: ASTRO_WIRE_ENV, wireEnv },
        stdout: true,
        stderr: true,
      })
      wrapStream('astro', worker.stdout)
      wrapStream('astro', worker.stderr)

      let stopping = false

      await new Promise<void>((resolve, reject) => {
        const onMessage = (msg: { type?: string }) => {
          if (msg.type === 'ready') {
            worker.off('message', onMessage)
            worker.off('error', onError)
            resolve()
          }
        }
        const onError = (err: Error) => {
          worker.off('message', onMessage)
          worker.off('error', onError)
          reject(err)
        }
        worker.on('message', onMessage)
        worker.once('error', onError)
      })

      worker.on('error', (err: Error) => {
        if (stopping) return
        process.stderr.write(`[astro worker error] ${err.stack ?? err.message}\n`)
      })

      return {
        url: `http://localhost:${ctx.assignedPort}`,
        async stop() {
          stopping = true
          worker.postMessage({ type: 'stop' })
          await worker.terminate().catch(() => {
            /* best-effort */
          })
        },
      }
    },
    async build(ctx: BuildContext): Promise<BuildOutput> {
      const astroLib = await import('astro')
      const root = resolveRoot(ctx.cwd)
      const outDir = join(ctx.outDir, 'client')

      await astroLib.build({
        root,
        outDir,
        logLevel: 'info',
      })

      return {
        assetsDir: outDir,
        indexHtml: join(outDir, 'index.html'),
      }
    },
    async start(_ctx: StartContext): Promise<StartHandle> {
      return { stop: () => {} }
    },
  }
}
