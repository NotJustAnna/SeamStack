import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  pushOutput,
  type Serveable,
  type DevContext,
  type DevHandle,
  type BuildContext,
  type BuildOutput,
  type StartContext,
  type StartHandle,
} from '@seamstack/core'
import { VITE_WIRE_ENV, writeViteWire } from './wire.js'

const VITE_MEMBER = 'vite'

function pushLines(text: string): void {
  for (const line of text.split('\n')) {
    pushOutput({ type: 'line', member: VITE_MEMBER, text: line })
  }
}

function buildCustomLogger(): import('vite').Logger {
  return {
    info: pushLines,
    warn: pushLines,
    warnOnce: pushLines,
    error: pushLines,
    clearScreen() {
      pushOutput({ type: 'clear', member: VITE_MEMBER })
    },
    hasErrorLogged: () => false,
    hasWarned: false,
  }
}

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
]

function findViteConfig(searchDir: string): string | undefined {
  for (const name of VITE_CONFIG_NAMES) {
    const p = join(searchDir, name)
    if (existsSync(p)) return p
  }
  return undefined
}

export interface ViteAdapterOptions {
  /**
   * Path to the Vite project root (where `index.html` and `vite.config.*` live),
   * resolved relative to the seam project root. Defaults to `'.'`.
   *
   * Use this when your client lives in a subdirectory (e.g. `'./client'`).
   */
  readonly root?: string
}

/**
 * Vite asset-source adapter.
 *
 * Runs Vite's dev server in `seam dev` and produces a static client bundle in
 * `seam build`. Pair with any asset-host (hono, express, fastify, elysia,
 * nestjs) — the host serves the built bundle in `seam start`.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import hono from '@seamstack/hono/adapter'
 *
 * export default defineWeave({
 *   fabric: [vite({ root: './client' }), hono({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function vite(opts: ViteAdapterOptions = {}): Serveable {
  const resolveRoot = (cwd: string) => (opts.root ? resolve(cwd, opts.root) : cwd)

  return {
    kind: 'serveable',
    framework: 'vite',
    traits: {
      producesAssets: true,
      canHostAssets: false,
      defaultMountPath: '/',
    },
    async dev(ctx: DevContext): Promise<DevHandle> {
      const { createServer } = await import('vite')
      const root = resolveRoot(ctx.cwd)

      const proxy: Record<string, string> = {}
      for (const peer of ctx.peers) {
        if (peer.role !== 'asset-host') continue
        for (const route of peer.routes) {
          proxy[route] = `http://127.0.0.1:${peer.devPort}`
        }
      }

      process.env[VITE_WIRE_ENV] = writeViteWire({
        mode: ctx.mode,
        host: ctx.publicHost,
        port: ctx.assignedPort,
        ...(Object.keys(proxy).length > 0 ? { proxy } : {}),
      })

      // Find vite.config.ts at the project root (where seam.config.ts lives), not
      // inside `root` — Vite by default only looks in `root` and would miss it
      // when the project layout puts the client in a subdirectory.
      const configFile = findViteConfig(ctx.cwd) ?? findViteConfig(root)

      const server = await createServer({
        root,
        configFile,
        customLogger: buildCustomLogger(),
      })
      await server.listen()
      server.printUrls()

      const address = server.httpServer?.address()
      const actualPort =
        typeof address === 'object' && address !== null ? address.port : ctx.assignedPort

      return {
        url: `http://localhost:${actualPort}`,
        async stop() {
          await server.close()
        },
      }
    },
    async build(ctx: BuildContext): Promise<BuildOutput> {
      const { build } = await import('vite')
      const root = resolveRoot(ctx.cwd)
      const outDir = join(ctx.outDir, 'client')

      const configFile = findViteConfig(ctx.cwd) ?? findViteConfig(root)

      await build({
        root,
        configFile,
        build: { outDir, emptyOutDir: true },
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
