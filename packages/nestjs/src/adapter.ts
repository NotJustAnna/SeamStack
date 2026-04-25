import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import {
  buildSpawnEnv,
  stopSpawnedChild,
  wrapStream,
  type BuildContext,
  type BuildOutput,
  type DevContext,
  type DevHandle,
  type Serveable,
  type StartContext,
  type StartHandle,
} from '@seamstack/core'
import { NESTJS_WIRE_ENV, writeNestjsWire } from './wire.js'

export interface NestjsAdapterOptions {
  /** Runtime to spawn under. Only `'node'` is supported today. */
  readonly runtime?: 'node'
  /**
   * Full list of paths your backend serves. **Overrides** the default `/api`:
   * if set, you get exactly what you specify, so include `/api` yourself if
   * you want it. The dev frontend proxies each entry during `seam dev`.
   * Each entry must start with `/` and not equal `/`.
   *
   * @example `routes: ['/api', '/graphql']`
   */
  readonly routes?: readonly string[]
}

interface NestCliConfig {
  readonly entryFile?: string
  readonly compilerOptions?: { readonly outDir?: string }
}

async function readNestCliConfig(cwd: string): Promise<NestCliConfig> {
  const path = join(cwd, 'nest-cli.json')
  if (!existsSync(path)) return {}
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as NestCliConfig
  } catch {
    return {}
  }
}

function resolveCompiledEntry(
  cwd: string,
  cfg: NestCliConfig,
): string {
  const outDir = cfg.compilerOptions?.outDir ?? 'dist'
  const entry = `${cfg.entryFile ?? 'main'}.js`
  return resolve(cwd, outDir, entry)
}

function requireNestBin(cwd: string): void {
  const local = join(cwd, 'node_modules', '.bin', 'nest')
  if (existsSync(local) || existsSync(`${local}.cmd`)) return
  throw new Error(
    "[@seamstack/nestjs/adapter] `nest` CLI not found. Install `@nestjs/cli` as a devDependency.",
  )
}

/**
 * NestJS asset-host adapter.
 *
 * Drives `nest start --watch` in `seam dev` and `nest build` in `seam build`,
 * then spawns the compiled entry in `seam start`. Reads the entry path from
 * `nest-cli.json`. Requires `@nestjs/cli` as a devDependency.
 *
 * Pair with any asset-source. In your NestJS app, import {@link SeamModule}
 * (`SeamModule.register({...})`) and apply {@link SeamSpaFilter} to fall
 * through to the SPA in prod.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import nestjs from '@seamstack/nestjs/adapter'
 *
 * export default defineWeave({
 *   fabric: [vite({ root: './client' }), nestjs()],
 * })
 * ```
 */
export default function nestjs(opts: NestjsAdapterOptions = {}): Serveable {
  if (opts.runtime && opts.runtime !== 'node') {
    throw new Error(
      `[@seamstack/nestjs/adapter] runtime '${opts.runtime}' is not supported (only 'node' is supported today).`,
    )
  }
  if (opts.routes) {
    for (const r of opts.routes) {
      if (typeof r !== 'string' || !r.startsWith('/') || r === '/') {
        throw new Error(
          `[@seamstack/nestjs/adapter] invalid route ${JSON.stringify(r)} — each entry must start with '/' and not equal '/'.`,
        )
      }
    }
  }

  return {
    kind: 'serveable',
    framework: 'nestjs',
    traits: {
      producesAssets: false,
      canHostAssets: true,
      defaultMountPath: '/api',
    },
    ...(opts.routes && opts.routes.length > 0 ? { routes: opts.routes } : {}),
    async dev(ctx: DevContext): Promise<DevHandle> {
      requireNestBin(ctx.cwd)
      const wire = {
        [NESTJS_WIRE_ENV]: writeNestjsWire({
          mode: 'dev',
          host: '127.0.0.1',
          port: ctx.assignedPort,
        }),
      }
      const env = buildSpawnEnv(ctx.cwd, wire)
      const child = execa('nest', ['start', '--watch'], {
        env,
        cwd: ctx.cwd,
        stdio: ['inherit', 'pipe', 'pipe'],
        reject: false,
        detached: true,
      })
      wrapStream('nestjs', child.stdout)
      wrapStream('nestjs', child.stderr)
      child.catch(() => {
        /* exit handled by stop() */
      })
      return {
        url: `http://127.0.0.1:${ctx.assignedPort}`,
        async stop() {
          await stopSpawnedChild(child)
        },
      }
    },
    async build(ctx: BuildContext): Promise<BuildOutput> {
      requireNestBin(ctx.cwd)
      const peers = Object.values(ctx.peerOutputs)
      const peer = peers.find((p) => p.assetsDir && p.indexHtml)
      if (!peer || !peer.assetsDir || !peer.indexHtml) {
        throw new Error(
          '[@seamstack/nestjs/adapter] build expected an asset-source peer with assetsDir and indexHtml',
        )
      }
      const env = buildSpawnEnv(ctx.cwd, {})
      const result = await execa('nest', ['build'], {
        env,
        cwd: ctx.cwd,
        stdio: 'inherit',
        reject: false,
      })
      if ((result.exitCode ?? 0) !== 0) {
        throw new Error('[@seamstack/nestjs/adapter] `nest build` failed')
      }
      await mkdir(ctx.outDir, { recursive: true })
      const manifest = {
        assetsDir: peer.assetsDir,
        indexHtml: peer.indexHtml,
      }
      const content = `export default ${JSON.stringify(manifest, null, 2)}\n`
      await writeFile(join(ctx.outDir, '_seam_prod.js'), content, 'utf8')
      return {}
    },
    async start(ctx: StartContext): Promise<StartHandle> {
      const cfg = await readNestCliConfig(ctx.cwd)
      const compiledEntry = resolveCompiledEntry(ctx.cwd, cfg)
      if (!existsSync(compiledEntry)) {
        throw new Error(
          `[@seamstack/nestjs/adapter] compiled entry not found at ${compiledEntry}. Run \`seam build\` first.`,
        )
      }
      const wire = {
        [NESTJS_WIRE_ENV]: writeNestjsWire({
          mode: 'prod',
          host: ctx.publicHost,
          port: ctx.assignedPort,
          distDir: ctx.outDir,
        }),
      }
      const env = buildSpawnEnv(ctx.cwd, wire)
      const child = execa('node', [compiledEntry], {
        env,
        cwd: ctx.cwd,
        stdio: ['inherit', 'pipe', 'pipe'],
        reject: false,
        detached: true,
      })
      wrapStream('nestjs', child.stdout)
      wrapStream('nestjs', child.stderr)
      child.catch(() => {
        /* exit handled by stop() */
      })
      return {
        url: `http://${ctx.publicHost}:${ctx.assignedPort}`,
        async stop() {
          await stopSpawnedChild(child)
        },
      }
    },
  }
}
