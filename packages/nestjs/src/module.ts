import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  Catch,
  Module,
  NotFoundException,
  type ArgumentsHost,
  type DynamicModule,
  type ExceptionFilter,
  type HttpException,
} from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import { readNestjsWire } from './wire.js'

/** Shape written to `_seam_prod.js` by `seam build`; loaded in prod to find the SPA. */
export interface ProdManifest {
  readonly assetsDir: string
  readonly indexHtml: string
}

export interface SeamModuleOptions {
  /** Reserved for future options. Currently unused. */
  readonly port?: number
}

const SEAM_INDEX_BODY = Symbol.for('@seamstack/nestjs:indexBody')

async function loadManifest(): Promise<ProdManifest | null> {
  const dir = readNestjsWire()?.distDir ?? process.cwd()
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

/**
 * NestJS exception filter that turns 404s into the built `index.html` so the
 * SPA can handle routing. GET/HEAD only — POST/PUT/etc. still 404.
 *
 * Wired automatically by {@link SeamModule.forRoot} in prod. Not normally used
 * directly, but exported in case you need to mount it manually.
 */
@Catch(NotFoundException)
export class SeamSpaFilter implements ExceptionFilter {
  constructor(private readonly indexBody: Buffer) {}

  catch(_exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    interface ExpressLike {
      status(code: number): ExpressLike
      set(name: string, value: string): ExpressLike
      send(body: unknown): ExpressLike
    }
    const req = ctx.getRequest<{ method?: string }>()
    const res = ctx.getResponse<ExpressLike>()
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      res.status(404).send('Not Found')
      return
    }
    res.status(200).set('content-type', 'text/html; charset=utf-8')
    res.send(method === 'HEAD' ? Buffer.alloc(0) : this.indexBody)
  }
}

/**
 * NestJS module that wires SeamStack into your app.
 *
 * Serves the built static bundle and falls back to `index.html` for unmatched
 * GET/HEAD routes (so client-side routing works). No-op in dev mode — the
 * asset-source dev server handles the frontend then.
 *
 * Also exposes static helpers for reading the seam-assigned host/port:
 * `SeamModule.host()` and `SeamModule.port()`.
 *
 * @example
 * ```ts
 * import { Module } from '@nestjs/common'
 * import { SeamModule } from '@seamstack/nestjs'
 *
 * @Module({ imports: [SeamModule.forRoot()] })
 * export class AppModule {}
 *
 * // main.ts
 * import { NestFactory } from '@nestjs/core'
 * import { SeamModule } from '@seamstack/nestjs'
 * import { AppModule } from './app.module'
 *
 * const app = await NestFactory.create(AppModule)
 * await app.listen(SeamModule.port(), SeamModule.host())
 * ```
 */
@Module({})
export class SeamModule {
  /**
   * Build the dynamic module to import in your `AppModule`.
   *
   * Returns `Promise<DynamicModule>`; NestJS awaits Promise modules in
   * `imports` automatically, so the usage stays declarative:
   * `@Module({ imports: [SeamModule.forRoot()] })`.
   */
  static async forRoot(_options: SeamModuleOptions = {}): Promise<DynamicModule> {
    if (readNestjsWire()?.mode === 'dev') {
      return { module: SeamModule, providers: [], exports: [] }
    }

    const manifest = await loadManifest()
    if (!manifest) {
      return { module: SeamModule, providers: [], exports: [] }
    }

    const indexBody = await readFile(manifest.indexHtml)

    return {
      module: SeamModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath: manifest.assetsDir,
          serveRoot: '/',
          serveStaticOptions: { index: false, fallthrough: true },
        }),
      ],
      providers: [
        { provide: SEAM_INDEX_BODY, useValue: indexBody },
        {
          provide: APP_FILTER,
          useFactory: () => new SeamSpaFilter(indexBody),
        },
      ],
      exports: [],
    }
  }

  /**
   * Read the port SeamStack expects this server to bind. Falls back to
   * `$PORT`, then `fallback` — `undefined` if that's also unset. Nest's own
   * `app.listen(port, hostname)` overloads require a concrete `port`, so pair
   * this with `?? 3000` (or your preferred default) at the call site rather
   * than relying on `fallback` alone — the return type stays `| undefined`
   * either way.
   */
  static port(fallback?: number): number | undefined {
    return seamPort(fallback)
  }

  /**
   * Read the host SeamStack expects this server to bind. Falls back to
   * `fallback` — `undefined` if that's also unset. Nest's own
   * `app.listen(port, hostname)` overloads require a concrete `hostname`, so
   * pair this with `?? '127.0.0.1'` (or your preferred default) at the call
   * site rather than relying on `fallback` alone.
   */
  static host(fallback?: string): string | undefined {
    return seamHost(fallback)
  }
}

/**
 * Read the port SeamStack expects this server to bind. Falls back to `$PORT`,
 * then `fallback` — left `undefined` if that's also unset. Equivalent to
 * `SeamModule.port(fallback)` — use whichever reads better at the call site.
 */
export function seamPort(fallback?: number): number | undefined {
  const fromWire = readNestjsWire()?.port
  if (typeof fromWire === 'number') return fromWire
  const fromPort = process.env['PORT']
  return fromPort !== undefined ? Number(fromPort) : fallback
}

/**
 * Read the host SeamStack expects this server to bind. Falls back to
 * `fallback` — left `undefined` if that's also unset. Equivalent to
 * `SeamModule.host(fallback)`.
 */
export function seamHost(fallback?: string): string | undefined {
  return readNestjsWire()?.host ?? fallback
}
