import { mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import { execa, type ResultPromise } from 'execa'
import { wrapStream } from './ansi-stream.js'
import type {
  Serveable,
  DevContext,
  DevHandle,
  BuildContext,
  BuildOutput,
  StartContext,
  StartHandle,
} from './types.js'

export interface HostWireInput {
  readonly mode: 'dev' | 'prod'
  readonly host: string
  readonly port: number
  readonly distDir?: string
}

/**
 * Fine-grained watch options forwarded to `tsx watch` when an asset-host
 * adapter is run in dev.
 */
export interface WatchOptions {
  /** Extra paths to watch (forwarded as `--include`). */
  readonly include?: readonly string[]
  /** Paths to ignore (forwarded as `--exclude`). */
  readonly exclude?: readonly string[]
  /** Set `false` to disable tsx's terminal clear on restart. Defaults to `true`. */
  readonly clearScreen?: boolean
}

/**
 * Controls dev-server file watching for asset-host adapters.
 *
 * - `true` (default) — tsx watches the entry and its imports.
 * - `false` — no watching; the server runs once and never restarts.
 * - {@link WatchOptions} — pass include/exclude globs.
 */
export type WatchSetting = boolean | WatchOptions

export interface HostAdapterOptions {
  readonly framework: string
  readonly defaultMountPath: string
  readonly entry: string
  readonly writeWireEnv: (input: HostWireInput) => Record<string, string>
  readonly runtime?: 'node'
  readonly watch?: WatchSetting
  /**
   * Full list of paths this backend serves. **Overrides** `defaultMountPath`:
   * if set, the resolver uses exactly these (so include `/api` yourself if
   * you want it). If unset, the host serves `defaultMountPath` only.
   * Each entry must start with `/` and not equal `/`.
   */
  readonly routes?: readonly string[]
}

function validateRoutes(framework: string, routes: readonly string[]): void {
  for (const r of routes) {
    if (typeof r !== 'string' || !r.startsWith('/') || r === '/') {
      throw new Error(
        `[@seamstack/${framework}/adapter] invalid route ${JSON.stringify(r)} — each entry must start with '/' and not equal '/'.`,
      )
    }
  }
}

export function buildTsxArgs(
  entryPath: string,
  watch: WatchSetting | undefined,
): string[] {
  if (!watch) return [entryPath]
  const args: string[] = ['watch']
  const cfg: WatchOptions = watch === true ? {} : watch
  if (cfg.clearScreen === false) args.push('--no-clear-screen')
  for (const p of cfg.include ?? []) args.push('--include', p)
  for (const p of cfg.exclude ?? []) args.push('--exclude', p)
  args.push(entryPath)
  return args
}

export function buildSpawnEnv(
  cwd: string,
  wireEnv: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v
  }
  for (const [k, v] of Object.entries(wireEnv)) {
    env[k] = v
  }
  const binDir = join(cwd, 'node_modules', '.bin')
  env['PATH'] = env['PATH'] ? `${binDir}${delimiter}${env['PATH']}` : binDir
  return env
}

type SpawnedChild = ResultPromise<{
  stdio: ['inherit', 'pipe', 'pipe']
  reject: false
  detached: true
}>

function spawnTsx(
  entryPath: string,
  env: Record<string, string>,
  cwd: string,
  watch: WatchSetting | undefined,
  member: string,
): SpawnedChild {
  const child = execa('tsx', buildTsxArgs(entryPath, watch), {
    env,
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    reject: false,
    detached: true,
  })
  wrapStream(member, child.stdout)
  wrapStream(member, child.stderr)
  return child
}

function signalProcessTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (typeof pid !== 'number') return
  if (process.platform === 'win32') {
    try {
      process.kill(pid, signal)
    } catch {
      /* already gone */
    }
    return
  }
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      /* already gone */
    }
  }
}

export async function stopSpawnedChild(
  child: ResultPromise<{
    stdio: 'inherit' | ['inherit', 'pipe', 'pipe']
    reject: false
    detached: true
  }>,
): Promise<void> {
  if (child.killed) return
  signalProcessTree(child.pid, 'SIGTERM')
  const force = setTimeout(() => {
    signalProcessTree(child.pid, 'SIGKILL')
  }, 2000)
  try {
    await child
  } catch {
    /* exit code from a killed child is expected */
  } finally {
    clearTimeout(force)
  }
}

export function createHostServeable(opts: HostAdapterOptions): Serveable {
  if (opts.runtime && opts.runtime !== 'node') {
    throw new Error(
      `[@seamstack/${opts.framework}/adapter] runtime '${opts.runtime}' is not supported (only 'node' is supported today).`,
    )
  }
  if (opts.routes) validateRoutes(opts.framework, opts.routes)
  const entryFor = (cwd: string) => resolve(cwd, opts.entry)

  return {
    kind: 'serveable',
    framework: opts.framework,
    traits: {
      producesAssets: false,
      canHostAssets: true,
      defaultMountPath: opts.defaultMountPath,
    },
    ...(opts.routes && opts.routes.length > 0 ? { routes: opts.routes } : {}),
    async dev(ctx: DevContext): Promise<DevHandle> {
      const wire = opts.writeWireEnv({
        mode: ctx.mode,
        host: '127.0.0.1',
        port: ctx.assignedPort,
      })
      const env = buildSpawnEnv(ctx.cwd, wire)
      const child = spawnTsx(entryFor(ctx.cwd), env, ctx.cwd, opts.watch ?? true, opts.framework)
      child.catch(() => {
        /* swallow — child exit is handled by stop() and CLI shutdown */
      })
      return {
        url: `http://127.0.0.1:${ctx.assignedPort}`,
        async stop() {
          await stopSpawnedChild(child)
        },
      }
    },
    async build(ctx: BuildContext): Promise<BuildOutput> {
      const peers = Object.values(ctx.peerOutputs)
      const peer = peers.find((p) => p.assetsDir && p.indexHtml)
      if (!peer || !peer.assetsDir || !peer.indexHtml) {
        throw new Error(
          `[@seamstack/${opts.framework}/adapter] build expected an asset-source peer with assetsDir and indexHtml`,
        )
      }
      await mkdir(ctx.outDir, { recursive: true })
      const manifestPath = join(ctx.outDir, '_seam_prod.js')
      const manifest = {
        assetsDir: peer.assetsDir,
        indexHtml: peer.indexHtml,
      }
      const content = `export default ${JSON.stringify(manifest, null, 2)}\n`
      await writeFile(manifestPath, content, 'utf8')
      return {}
    },
    async start(ctx: StartContext): Promise<StartHandle> {
      const wire = opts.writeWireEnv({
        mode: ctx.mode,
        host: ctx.publicHost,
        port: ctx.assignedPort,
        distDir: ctx.outDir,
      })
      const env = buildSpawnEnv(ctx.cwd, wire)
      const child = spawnTsx(entryFor(ctx.cwd), env, ctx.outDir, undefined, opts.framework)
      child.catch(() => {
        /* swallow */
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
