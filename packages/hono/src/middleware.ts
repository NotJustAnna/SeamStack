import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { resolveManifestDir } from '@seamstack/core'
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
  /**
   * Fallback hostname when not running under `seam` (e.g. `node server.js`
   * directly) and wire data is absent. Leave unset to let your `serve()`/
   * `Bun.serve()`/`Deno.serve()` apply its own default instead of a
   * seam-imposed one. Named `hostname` (not `host`) to match the key your
   * runtime's `serve()` actually takes — spread the returned trio straight in.
   */
  readonly hostname?: string
  /**
   * Fallback port when not running under `seam` and `$PORT` is unset. Leave
   * unset to let your runtime's `serve()` pick its own default.
   */
  readonly port?: number
}

/**
 * The trio you destructure from `seam(...)`:
 *
 * - `inlay` — middleware to mount **after** your routes. Falls through to the
 *   built SPA in prod; no-ops in dev.
 * - `hostname` — the host the seam expects this server to bind. In dev,
 *   always `127.0.0.1` (internal). In prod, the user's `--host` setting.
 *   `undefined` when running standalone with no `hostname` fallback given.
 *   Named to match `serve()`/`Bun.serve()`/`Deno.serve()`'s own option, so
 *   `{ ...opts }` spreads straight in.
 * - `port` — the port the seam expects this server to bind. `undefined`
 *   under the same standalone conditions.
 */
export interface SeamHandle {
  readonly inlay: MiddlewareHandler
  readonly hostname: string | undefined
  readonly port: number | undefined
}

/**
 * Wire your Hono app into SeamStack.
 *
 * Returns the `hostname` + `port` the seam tells you to bind, plus an `inlay`
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
 * const { inlay, ...opts } = seam({ serveStatic })
 * app.use(inlay)
 *
 * serve({ fetch: app.fetch, ...opts })
 * console.log(`[hono] listening on http://${opts.hostname}:${opts.port}`)
 * ```
 */
export function seam(options: SeamOptions): SeamHandle {
  return {
    inlay: createInlay(options.serveStatic),
    hostname: resolveHostname(options.hostname),
    port: resolvePort(options.port),
  }
}

function resolveHostname(fallback: string | undefined): string | undefined {
  return readHonoWire()?.host ?? fallback
}

function resolvePort(fallback: number | undefined): number | undefined {
  const fromWire = readHonoWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return fromPort !== undefined ? Number(fromPort) : fallback
}

async function loadManifest(): Promise<ProdManifest | null> {
  const dir = resolveManifestDir(readHonoWire()?.distDir)
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
