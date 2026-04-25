import { existsSync, promises as fs } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import {
  wrapStream,
  type BuildContext,
  type BuildOutput,
  type DevContext,
  type DevHandle,
  type Serveable,
  type StartContext,
  type StartHandle,
} from '@seamstack/core'
import { ANGULAR_WIRE_ENV, writeAngularWire } from './wire.js'

const ANGULAR_WORKER_URL = new URL('./angular-worker.js', import.meta.url)

export interface AngularAdapterOptions {
  /**
   * Angular project name to build/serve. If unset, the adapter reads
   * `defaultProject` or the first project listed in `angular.json`.
   */
  readonly project?: string
  /**
   * Path to the Angular workspace root (where `angular.json` lives), resolved
   * relative to the seam project root. Defaults to `'.'`.
   */
  readonly root?: string
}

interface AngularJson {
  readonly defaultProject?: string
  readonly projects?: Record<string, AngularProject>
}

interface AngularProject {
  readonly architect?: Record<string, AngularTarget>
  readonly targets?: Record<string, AngularTarget>
}

interface AngularTarget {
  readonly options?: { readonly outputPath?: string; readonly index?: string }
}

async function readAngularJson(workspaceRoot: string): Promise<AngularJson> {
  const path = join(workspaceRoot, 'angular.json')
  if (!existsSync(path)) {
    throw new Error(
      `[@seamstack/angular/adapter] angular.json not found at ${path}`,
    )
  }
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw) as AngularJson
}

function pickProject(
  json: AngularJson,
  hint: string | undefined,
): { readonly name: string; readonly project: AngularProject } {
  const projects = json.projects ?? {}
  const name = hint ?? json.defaultProject ?? Object.keys(projects)[0]
  if (!name || !projects[name]) {
    throw new Error(
      '[@seamstack/angular/adapter] could not determine Angular project. Set `project` on the adapter or `defaultProject` in angular.json.',
    )
  }
  return { name, project: projects[name] }
}

function buildProxyConfig(
  ctx: DevContext,
): Record<
  string,
  { target: string; secure: false; changeOrigin: true; ws: true }
> {
  const proxy: Record<
    string,
    { target: string; secure: false; changeOrigin: true; ws: true }
  > = {}
  for (const peer of ctx.peers) {
    if (peer.role !== 'asset-host') continue
    for (const route of peer.routes) {
      const path = route.endsWith('/') ? `${route}**` : `${route}/**`
      proxy[path] = {
        target: `http://127.0.0.1:${peer.devPort}`,
        secure: false,
        changeOrigin: true,
        ws: true,
      }
    }
  }
  return proxy
}

function createWorkspaceHost(): import('@angular-devkit/core').workspaces.WorkspaceHost {
  return {
    readFile: (p) => fs.readFile(p, 'utf-8'),
    writeFile: (p, contents) => fs.writeFile(p, contents),
    async isDirectory(p) {
      try {
        const stats = await fs.stat(p)
        return stats.isDirectory()
      } catch {
        return false
      }
    },
    async isFile(p) {
      try {
        const stats = await fs.stat(p)
        return stats.isFile()
      } catch {
        return false
      }
    },
  }
}

/**
 * Angular asset-source adapter.
 *
 * Drives the Angular build toolkit (`@angular-devkit/architect` +
 * `@angular/build:dev-server`) directly — `seam dev` runs the dev-server inside
 * a Worker thread for stdout isolation, and `seam build` schedules the
 * configured build target in-process. Pair with any asset-host.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import angular from '@seamstack/angular/adapter'
 * import hono from '@seamstack/hono/adapter'
 *
 * export default defineWeave({
 *   fabric: [angular({ project: 'web' }), hono({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function angular(opts: AngularAdapterOptions = {}): Serveable {
  return {
    kind: 'serveable',
    framework: 'angular',
    traits: {
      producesAssets: true,
      canHostAssets: false,
      defaultMountPath: '/',
    },
    async dev(ctx: DevContext): Promise<DevHandle> {
      const workspaceRoot = opts.root ? resolve(ctx.cwd, opts.root) : ctx.cwd
      const angularJson = await readAngularJson(workspaceRoot)
      const { name } = pickProject(angularJson, opts.project)

      const proxy = buildProxyConfig(ctx)
      const proxyPath = join(ctx.outDir, '_seam_angular_proxy.json')
      let proxyArg: string | null = null
      if (Object.keys(proxy).length > 0) {
        await mkdir(ctx.outDir, { recursive: true })
        await writeFile(proxyPath, JSON.stringify(proxy, null, 2), 'utf8')
        proxyArg = proxyPath
      }

      const wireEnv = writeAngularWire({
        mode: 'dev',
        host: ctx.publicHost,
        port: ctx.assignedPort,
        ...(Object.keys(proxy).length > 0
          ? {
              proxy: Object.fromEntries(
                Object.entries(proxy).map(([k, v]) => [k, v.target]),
              ),
            }
          : {}),
      })

      const worker = new Worker(ANGULAR_WORKER_URL, {
        workerData: {
          workspaceRoot,
          project: name,
          host: ctx.publicHost,
          port: ctx.assignedPort,
          proxyConfig: proxyArg,
          wireEnvKey: ANGULAR_WIRE_ENV,
          wireEnv,
        },
        stdout: true,
        stderr: true,
      })
      wrapStream('angular', worker.stdout)
      wrapStream('angular', worker.stderr)

      let stopping = false

      await new Promise<void>((res, reject) => {
        const onMessage = (msg: { type?: string; message?: string }) => {
          if (msg.type === 'ready') {
            worker.off('message', onMessage)
            worker.off('error', onError)
            res()
          } else if (msg.type === 'error') {
            worker.off('message', onMessage)
            worker.off('error', onError)
            reject(new Error(msg.message ?? 'angular worker error'))
          }
        }
        const onError = (err: Error) => {
          worker.off('message', onMessage)
          worker.off('error', onError)
          reject(err)
        }
        worker.on('message', onMessage)
        worker.once('error', onError)
      })

      worker.on('error', (err) => {
        if (stopping) return
        process.stderr.write(
          `[angular worker error] ${err.stack ?? err.message}\n`,
        )
      })

      return {
        url: `http://localhost:${ctx.assignedPort}`,
        async stop() {
          stopping = true
          worker.postMessage({ type: 'stop' })
          await new Promise<void>((res) => {
            const timer = setTimeout(() => {
              worker.terminate().finally(() => res())
            }, 2000)
            worker.once('exit', () => {
              clearTimeout(timer)
              res()
            })
          })
        },
      }
    },
    async build(ctx: BuildContext): Promise<BuildOutput> {
      const workspaceRoot = opts.root ? resolve(ctx.cwd, opts.root) : ctx.cwd
      const angularJson = await readAngularJson(workspaceRoot)
      const { name } = pickProject(angularJson, opts.project)

      const outClient = join(ctx.outDir, 'client')

      let architectMod: typeof import('@angular-devkit/architect')
      let architectNodeMod: typeof import('@angular-devkit/architect/node')
      let coreMod: typeof import('@angular-devkit/core')
      try {
        architectMod = await import('@angular-devkit/architect')
        architectNodeMod = await import(
          /* @vite-ignore */ '@angular-devkit/architect/node/index.js'
        )
        coreMod = await import('@angular-devkit/core')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          '[@seamstack/angular/adapter] missing Angular toolkit. Install `@angular-devkit/architect` and `@angular-devkit/core` (e.g. via `@angular/cli` as a devDependency).\n' +
            `Underlying error: ${message}`,
        )
      }

      const { workspace } = await coreMod.workspaces.readWorkspace(
        workspaceRoot,
        createWorkspaceHost(),
        coreMod.workspaces.WorkspaceFormat.JSON,
      )
      const architectHost = new architectNodeMod.WorkspaceNodeModulesArchitectHost(
        workspace,
        workspaceRoot,
      )
      const registry = new coreMod.json.schema.CoreSchemaRegistry()
      registry.addPostTransform(coreMod.json.schema.transforms.addUndefinedDefaults)
      const architect = new architectMod.Architect(architectHost, registry)

      const logger = new coreMod.logging.Logger('seam-angular-build')
      logger.subscribe((entry) => {
        process.stdout.write(`${entry.message}\n`)
      })

      const run = await architect.scheduleTarget(
        { project: name, target: 'build', configuration: 'production' },
        { outputPath: outClient } as never,
        { logger },
      )

      try {
        const result = await run.lastOutput
        if (!result.success) {
          throw new Error('[@seamstack/angular/adapter] `ng build` failed')
        }
      } finally {
        await run.stop()
      }

      // Modern Angular (v17+) emits to <outputPath>/browser/. Older builders
      // emit directly to <outputPath>. Probe to find the right index.html.
      const browserDir = join(outClient, 'browser')
      const indexInBrowser = join(browserDir, 'index.html')
      if (existsSync(indexInBrowser)) {
        return { assetsDir: browserDir, indexHtml: indexInBrowser }
      }
      return {
        assetsDir: outClient,
        indexHtml: join(outClient, 'index.html'),
      }
    },
    async start(_ctx: StartContext): Promise<StartHandle> {
      return { stop: () => {} }
    },
  }
}
