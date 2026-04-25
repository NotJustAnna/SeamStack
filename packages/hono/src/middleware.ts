import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { readHonoWire } from './wire.js'

/** Shape written to `_seam_prod.js` by `seam build`; loaded in prod to find the SPA. */
export interface ProdManifest {
  readonly assetsDir: string
  readonly indexHtml: string
}

export interface ServeStaticOptions {
  readonly root?: string
  readonly path?: string
  readonly rewriteRequestPath?: (path: string, c?: Context) => string
}

/**
 * The `serveStatic` middleware factory from your Hono runtime adapter.
 *
 * For Node, this is `serveStatic` from `@hono/node-server/serve-static`. Bun,
 * Deno, and other runtimes export their own. SeamStack stays runtime-agnostic
 * by asking you to pass it in.
 */
export type ServeStaticFn = (options?: ServeStaticOptions) => MiddlewareHandler

export interface SeamOptions {
  /** Runtime-specific `serveStatic` factory. See {@link ServeStaticFn}. */
  readonly serveStatic: ServeStaticFn
  /** Fallback port when not running under `seam` (e.g. `node server.js` directly). Defaults to 3000. */
  readonly port?: number
}

/**
 * The trio you destructure from `seam(...)`:
 *
 * - `inlay` — middleware to mount **after** your routes. Falls through to the
 *   built SPA in prod; no-ops in dev.
 * - `host` — the host the seam expects this server to bind. In dev, always
 *   `127.0.0.1` (internal). In prod, the user's `--host` setting.
 * - `port` — the port the seam expects this server to bind.
 */
export interface SeamHandle {
  readonly inlay: MiddlewareHandler
  readonly host: string
  readonly port: number
}

/**
 * Wire your Hono app into SeamStack.
 *
 * Returns the `host` + `port` the seam tells you to bind, plus an `inlay`
 * middleware that serves the built SPA in prod (and is inert in dev — Vite/
 * Astro/Angular handle the frontend then).
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { serve } from '@hono/node-server'
 * import { serveStatic } from '@hono/node-server/serve-static'
 * import { seam } from '@seamstack/hono'
 *
 * const app = new Hono()
 * app.get('/api/hello', (c) => c.json({ msg: 'hi from hono' }))
 *
 * const { inlay, host, port } = seam({ serveStatic })
 * app.use(inlay)
 *
 * serve({ fetch: app.fetch, hostname: host, port })
 * console.log(`[hono] listening on http://${host}:${port}`)
 * ```
 */
export function seam(options: SeamOptions): SeamHandle {
  return {
    inlay: createInlay(options.serveStatic),
    host: seamHost(),
    port: resolvePort(options.port ?? 3000),
  }
}

function resolvePort(fallback: number): number {
  const fromWire = readHonoWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return Number(fromPort ?? fallback)
}

/**
 * Read the host SeamStack expects this server to bind.
 *
 * Falls back to `fallback` if not running under seam, then `'127.0.0.1'`.
 * Most users get this from `seam()`'s return value instead — use this directly
 * only if you bind the server somewhere `seam()` can't reach.
 */
export function seamHost(fallback?: string): string {
  return readHonoWire()?.host ?? fallback ?? '127.0.0.1'
}

/**
 * Read the port SeamStack expects this server to bind.
 *
 * Falls back to `$PORT` (env var), then `fallback`. Most users get this from
 * `seam()`'s return value instead.
 */
export function seamPort(fallback = 3000): number {
  return resolvePort(fallback)
}

async function loadManifest(): Promise<ProdManifest | null> {
  const dir = readHonoWire()?.distDir ?? process.cwd()
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

function createInlay(serveStaticFn: ServeStaticFn): MiddlewareHandler {
  let initPromise: Promise<Hono | null> | null = null

  function ensureInit(): Promise<Hono | null> {
    if (initPromise) return initPromise
    initPromise = (async () => {
      if (readHonoWire()?.mode === 'dev') return null
      const manifest = await loadManifest()
      if (!manifest) return null
      // Some runtimes' serveStatic (e.g. @hono/node-server/serve-static) only accept paths
      // relative to process.cwd(), so normalize before handing off.
      const relRoot = relative(process.cwd(), manifest.assetsDir) || '.'
      const indexRel = relative(manifest.assetsDir, manifest.indexHtml).replace(/\\/g, '/')
      // Sub-app gives serveStatic a fresh context; needed because our outer
      // middleware runs after user routes (which mark the parent context as
      // finalized for the 404), and Hono's serveStatic short-circuits on
      // finalized contexts.
      const subApp = new Hono()
      subApp.use(serveStaticFn({ root: relRoot }))
      subApp.use(
        serveStaticFn({
          root: relRoot,
          rewriteRequestPath: () => '/' + indexRel,
        }),
      )
      return subApp
    })()
    return initPromise
  }

  return async (c, next) => {
    await next()
    if (c.res.status !== 404) return
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return

    const subApp = await ensureInit()
    if (!subApp) return

    const res = await subApp.fetch(c.req.raw)
    if (res.status !== 404) {
      c.res = res
    }
  }
}
