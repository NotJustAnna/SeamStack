import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'
import { readFastifyWire } from './wire.js'

/** Shape written to `_seam_prod.js` by `seam build`; loaded in prod to find the SPA. */
export interface ProdManifest {
  readonly assetsDir: string
  readonly indexHtml: string
}

export interface SeamOptions {
  /**
   * Fallback host when not running under `seam` (e.g. `node server.js`
   * directly) and `SEAM_HOST`-style wire data is absent. Leave unset to let
   * Fastify apply its own default (`127.0.0.1`) instead of a seam-imposed one.
   */
  readonly host?: string
  /**
   * Fallback port when not running under `seam` and `$PORT` is unset. Leave
   * unset to let Fastify/Node pick their own default (an OS-assigned
   * ephemeral port).
   */
  readonly port?: number
}

/**
 * The trio you destructure from `seam()`:
 *
 * - `inlay` — Fastify plugin to register **after** your routes. Falls through
 *   to the built SPA in prod; no-ops in dev.
 * - `host` — the host the seam expects this server to bind. `undefined` when
 *   running standalone with no `host` fallback given — spread it into
 *   `listen()` as-is and Fastify applies its own default.
 * - `port` — the port the seam expects this server to bind. `undefined` under
 *   the same standalone conditions — Fastify/Node then pick an ephemeral port.
 */
export interface SeamHandle {
  readonly inlay: FastifyPluginAsync
  readonly host: string | undefined
  readonly port: number | undefined
}

/**
 * Wire your Fastify app into SeamStack.
 *
 * Returns the `host` + `port` the seam tells you to bind, plus an `inlay`
 * plugin that serves the built SPA in prod (and is inert in dev — Vite/Astro/
 * Angular handle the frontend then).
 *
 * @example
 * ```ts
 * import Fastify from 'fastify'
 * import { seam } from '@seamstack/fastify'
 *
 * const app = Fastify()
 * app.get('/api/hello', async () => ({ msg: 'hi from fastify' }))
 *
 * const { inlay, ...opts } = seam()
 * await app.register(inlay)
 *
 * await app.listen({ ...opts })
 * console.log(`[fastify] listening on http://${opts.host}:${opts.port}`)
 * ```
 */
export function seam(options: SeamOptions = {}): SeamHandle {
  return {
    inlay: createInlay(),
    host: resolveHost(options.host),
    port: resolvePort(options.port),
  }
}

function resolveHost(fallback: string | undefined): string | undefined {
  return readFastifyWire()?.host ?? fallback
}

function resolvePort(fallback: number | undefined): number | undefined {
  const fromWire = readFastifyWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return fromPort !== undefined ? Number(fromPort) : fallback
}

async function loadManifest(): Promise<ProdManifest | null> {
  const dir = readFastifyWire()?.distDir ?? process.cwd()
  const path = join(dir, '_seam_prod.js')
  try {
    const mod = (await import(pathToFileURL(path).href)) as
      | { default?: ProdManifest }
      | ProdManifest
    const manifest =
      'default' in mod && mod.default ? mod.default : (mod as ProdManifest)
    if (!manifest || !manifest.assetsDir || !manifest.indexHtml) return null
    return {
      assetsDir: join(dir, manifest.assetsDir),
      indexHtml: join(dir, manifest.indexHtml),
    }
  } catch {
    return null
  }
}

async function seamPluginImpl(app: FastifyInstance): Promise<void> {
  if (readFastifyWire()?.mode === 'dev') return

  const manifest = await loadManifest()
  if (!manifest) return

  await app.register(fastifyStatic, {
    root: manifest.assetsDir,
    wildcard: false,
    index: ['index.html'],
  })

  const indexBody = await readFile(manifest.indexHtml)

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply.code(404).send()
      return
    }
    reply
      .code(200)
      .header('content-type', 'text/html; charset=utf-8')
      .send(request.method === 'HEAD' ? Buffer.alloc(0) : indexBody)
  })
}

function createInlay(): FastifyPluginAsync {
  return fp(seamPluginImpl, {
    name: '@seamstack/fastify',
    fastify: '5.x',
  })
}
