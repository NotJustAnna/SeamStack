import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { readElysiaWire } from './wire.js'

/** Shape written to `_seam_prod.js` by `seam build`; loaded in prod to find the SPA. */
export interface ProdManifest {
  readonly assetsDir: string
  readonly indexHtml: string
}

export interface SeamOptions {
  /** Fallback port when not running under `seam`. Defaults to 3000. */
  readonly port?: number
}

/**
 * The trio you destructure from `seam()`:
 *
 * - `inlay` — `Promise<Elysia>`. Pass to `.use(...)`; Elysia awaits it before
 *   listening. Serves the built SPA in prod; inert in dev.
 * - `host` — the host the seam expects this server to bind.
 * - `port` — the port the seam expects this server to bind.
 *
 * `inlay` is async because the prod manifest must be loaded from disk before
 * the static plugin can be configured.
 */
export interface SeamHandle {
  readonly inlay: Promise<Elysia>
  readonly host: string
  readonly port: number
}

/**
 * Wire your Elysia app into SeamStack.
 *
 * Returns the `host` + `port` the seam tells you to bind, plus an `inlay` that
 * serves the built SPA in prod (and is inert in dev).
 *
 * @example
 * ```ts
 * import { Elysia } from 'elysia'
 * import { node } from '@elysiajs/node'
 * import { seam } from '@seamstack/elysia'
 *
 * const { inlay, host, port } = seam()
 *
 * new Elysia({ adapter: node() })
 *   .get('/api/hello', () => ({ msg: 'hi from elysia' }))
 *   .use(inlay)
 *   .listen({ hostname: host, port }, () =>
 *     console.log(`[elysia] listening on http://${host}:${port}`),
 *   )
 * ```
 */
export function seam(options: SeamOptions = {}): SeamHandle {
  return {
    inlay: buildInlay(),
    host: seamHost(),
    port: resolvePort(options.port ?? 3000),
  }
}

function resolvePort(fallback: number): number {
  const fromWire = readElysiaWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return Number(fromPort ?? fallback)
}

/**
 * Read the host SeamStack expects this server to bind. Falls back to
 * `fallback`, then `'127.0.0.1'`. Most users get this from `seam()` instead.
 */
export function seamHost(fallback?: string): string {
  return readElysiaWire()?.host ?? fallback ?? '127.0.0.1'
}

/**
 * Read the port SeamStack expects this server to bind. Falls back to `$PORT`,
 * then `fallback`. Most users get this from `seam()` instead.
 */
export function seamPort(fallback = 3000): number {
  return resolvePort(fallback)
}

async function loadManifest(): Promise<ProdManifest | null> {
  const dir = readElysiaWire()?.distDir ?? process.cwd()
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

const STATIC_MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
}

async function buildInlay(): Promise<Elysia> {
  const plugin = new Elysia({ name: '@seamstack/elysia' })
  if (readElysiaWire()?.mode === 'dev') return plugin

  const manifest = await loadManifest()
  if (!manifest) return plugin

  const indexBody = await readFile(manifest.indexHtml)

  plugin.get('/', ({ set }) => {
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return indexBody
  })

  // @elysiajs/static (1.4.x) doesn't set Content-Type on served files — the
  // browser then refuses module scripts under strict MIME checking. Patch the
  // missing header from the request path's extension before the response goes
  // out. Once @elysiajs/static lands content-type support, this hook can drop.
  plugin.onAfterHandle(({ path, set }) => {
    if (set.headers['content-type'] || set.headers['Content-Type']) return
    const ext = path.match(/\.(\w+)(?:\?.*)?$/)?.[1]?.toLowerCase()
    if (!ext) return
    const ct = STATIC_MIME[ext]
    if (ct) set.headers['content-type'] = ct
  })

  plugin.use(
    staticPlugin({
      assets: manifest.assetsDir,
      prefix: '/',
      alwaysStatic: false,
    }),
  )

  plugin.onError({ as: 'global' }, ({ code, request, set }) => {
    if (code !== 'NOT_FOUND') return
    if (request.method !== 'GET' && request.method !== 'HEAD') return
    set.status = 200
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return request.method === 'HEAD' ? '' : indexBody
  })

  return plugin
}
