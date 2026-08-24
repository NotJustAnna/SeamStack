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
  type INestApplication,
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

export interface SeamStitchDefaults {
  /**
   * Fallback host when not running under `seam` and wire data is absent.
   * Leave unset to let Nest apply its own default (listen on all interfaces),
   * same as a stock `app.listen(port)`.
   */
  readonly host?: string
  /**
   * Fallback port when not running under `seam` and `$PORT` is unset.
   * Defaults to 3000, matching Nest's own scaffold
   * (`app.listen(process.env.PORT ?? 3000)`).
   */
  readonly port?: number
}

/**
 * Joins a Nest app to the seam. Returned by {@link SeamModule.stitch}.
 *
 * The host/port are resolved at construction — wire first, then `$PORT`
 * (port only), then the given defaults — and exposed as the readonly
 * `host`/`port` fields, so what you read is exactly what `listen()` binds.
 *
 * A stitch is immutable: `defaultHost()`/`defaultPort()`/`defaults()` return
 * a *new* fully-resolved stitch rather than mutating this one, so the fields
 * of any instance you hold are always final. Defaults are exactly that —
 * they apply only when the seam has no opinion; the wire always wins.
 */
export class SeamStitch {
  /**
   * The host this stitch binds. `undefined` when running standalone with no
   * `host` default — `listen()` then omits the host argument entirely so
   * Nest keeps its own default (listen on all interfaces).
   */
  readonly host: string | undefined
  /** The port this stitch binds. */
  readonly port: number

  constructor(
    private readonly app: INestApplication,
    private readonly fallbacks: SeamStitchDefaults = {},
  ) {
    const wire = readNestjsWire()
    const envPort = process.env['PORT']
    this.port = wire?.port ?? (envPort !== undefined ? Number(envPort) : (fallbacks.port ?? 3000))
    this.host = wire?.host ?? fallbacks.host
  }

  /** A new stitch whose port falls back to `port` when the seam has no opinion. */
  defaultPort(port: number): SeamStitch {
    return new SeamStitch(this.app, { ...this.fallbacks, port })
  }

  /** A new stitch whose host falls back to `host` when the seam has no opinion. */
  defaultHost(host: string): SeamStitch {
    return new SeamStitch(this.app, { ...this.fallbacks, host })
  }

  /** A new stitch with `defaults` merged over this one's. */
  defaults(defaults: SeamStitchDefaults): SeamStitch {
    return new SeamStitch(this.app, { ...this.fallbacks, ...defaults })
  }

  /**
   * Bind the app to {@link host}:{@link port}. Resolves to whatever
   * `app.listen()` resolves to (the underlying server).
   */
  async listen(): Promise<unknown> {
    return this.host !== undefined
      ? this.app.listen(this.port, this.host)
      : this.app.listen(this.port)
  }
}

/**
 * NestJS module that wires SeamStack into your app.
 *
 * Serves the built static bundle and falls back to `index.html` for unmatched
 * GET/HEAD routes (so client-side routing works). No-op in dev mode — the
 * asset-source dev server handles the frontend then.
 *
 * In `main.ts`, bind via `SeamModule.stitch(app).listen()`. The stitch's
 * readonly `host`/`port` fields carry the resolved values if you need them
 * (e.g. for logging) — though Nest's own `app.getUrl()` reports the actually
 * bound address after `listen()`.
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
 * await SeamModule.stitch(app).defaultPort(3000).listen()
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
   * Join `app` to the seam. The returned {@link SeamStitch} resolves the
   * host/port immediately (readonly `host`/`port` fields); chain
   * `defaultPort()`/`defaultHost()`/`defaults()` for standalone fallbacks and
   * call `.listen()` to bind:
   * `await SeamModule.stitch(app).defaultPort(3000).listen()`.
   */
  static stitch(app: INestApplication): SeamStitch {
    return new SeamStitch(app)
  }
}

