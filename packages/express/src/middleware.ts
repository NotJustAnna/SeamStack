import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createNodeServeAssets,
  type NodeMiddleware,
  type ProdManifest,
} from './runtime.js'
import { readExpressWire } from './wire.js'

export interface SeamOptions {
  /** Fallback port when not running under `seam` (e.g. `node server.js` directly). Defaults to 3000. */
  readonly port?: number
}

/**
 * The trio you destructure from `seam()`:
 *
 * - `inlay` — Express middleware to mount **after** your routes. Falls
 *   through to the built SPA in prod; no-ops in dev.
 * - `host` — the host the seam expects this server to bind.
 * - `port` — the port the seam expects this server to bind.
 */
export interface SeamHandle {
  readonly inlay: NodeMiddleware
  readonly host: string
  readonly port: number
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
 * const { inlay, host, port } = seam()
 * app.use(inlay)
 *
 * app.listen(port, host, () => console.log(`[express] listening on http://${host}:${port}`))
 * ```
 */
export function seam(options: SeamOptions = {}): SeamHandle {
  return {
    inlay: createInlay(),
    host: seamHost(),
    port: resolvePort(options.port ?? 3000),
  }
}

function resolvePort(fallback: number): number {
  const fromWire = readExpressWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return Number(fromPort ?? fallback)
}

/**
 * Read the host SeamStack expects this server to bind. Falls back to
 * `fallback`, then `'127.0.0.1'`. Most users get this from `seam()` instead.
 */
export function seamHost(fallback?: string): string {
  return readExpressWire()?.host ?? fallback ?? '127.0.0.1'
}

/**
 * Read the port SeamStack expects this server to bind. Falls back to `$PORT`,
 * then `fallback`. Most users get this from `seam()` instead.
 */
export function seamPort(fallback = 3000): number {
  return resolvePort(fallback)
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
    return manifest
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
