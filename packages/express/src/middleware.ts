import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createNodeServeAssets,
  type NodeMiddleware,
  type ProdManifest,
} from './runtime.js'
import { readExpressWire } from './wire.js'

export interface SeamOptions {
  /**
   * Fallback host when not running under `seam` (e.g. `node server.js`
   * directly) and wire data is absent. Leave unset to let Express/Node apply
   * their own default (listen on all interfaces) instead of a seam-imposed one.
   */
  readonly host?: string
  /**
   * Fallback port when not running under `seam` and `$PORT` is unset. Leave
   * unset to let Express/Node pick their own default (an OS-assigned
   * ephemeral port).
   */
  readonly port?: number
}

/**
 * The trio you destructure from `seam()`:
 *
 * - `inlay` — Express middleware to mount **after** your routes. Falls
 *   through to the built SPA in prod; no-ops in dev.
 * - `host` — the host the seam expects this server to bind. `undefined` when
 *   running standalone with no `host` fallback given. Express's own
 *   `listen(port, hostname, cb)` overloads require concrete values (unlike
 *   Node's own `net.Server`, which allows both optional) — give `host`/`port`
 *   a destructuring default (e.g. `host = '127.0.0.1'`) if you call `listen`
 *   positionally, so Express/Node still apply their own default value when
 *   seam doesn't have one.
 * - `port` — the port the seam expects this server to bind. `undefined` under
 *   the same standalone conditions.
 */
export interface SeamHandle {
  readonly inlay: NodeMiddleware
  readonly host: string | undefined
  readonly port: number | undefined
}

/**
 * Wire your Express app into SeamStack.
 *
 * Returns the `host` + `port` the seam tells you to bind, plus an `inlay`
 * middleware that serves the built SPA in prod (and is inert in dev — Vite/
 * Astro/Angular handle the frontend then).
 *
 * @example
 * ```ts
 * import express from 'express'
 * import { seam } from '@seamstack/express'
 *
 * const app = express()
 * app.get('/api/hello', (_req, res) => res.json({ msg: 'hi from express' }))
 *
 * const { inlay, host = '127.0.0.1', port = 3000 } = seam()
 * app.use(inlay)
 *
 * app.listen(port, host, () => console.log(`[express] listening on http://${host}:${port}`))
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
  return readExpressWire()?.host ?? fallback
}

function resolvePort(fallback: number | undefined): number | undefined {
  const fromWire = readExpressWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return fromPort !== undefined ? Number(fromPort) : fallback
}

async function loadManifest(): Promise<ProdManifest | null> {
  const dir = readExpressWire()?.distDir ?? process.cwd()
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

function createInlay(): NodeMiddleware {
  let initPromise: Promise<NodeMiddleware | null> | null = null

  function ensureInit(): Promise<NodeMiddleware | null> {
    if (initPromise) return initPromise
    initPromise = (async () => {
      if (readExpressWire()?.mode === 'dev') return null
      const manifest = await loadManifest()
      if (!manifest) return null
      return createNodeServeAssets(manifest)
    })()
    return initPromise
  }

  return async (req, res, next) => {
    const handler = await ensureInit()
    if (!handler) return next()
    return handler(req, res, next)
  }
}
