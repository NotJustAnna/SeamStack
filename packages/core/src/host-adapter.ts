import { existsSync, watch as fsWatch } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execa, type ResultPromise } from 'execa'
import { wrapStream } from './ansi-stream.js'
import type { BuildTool, BuildToolContext, Runner } from './build-tool.js'
import type {
  Serveable,
  DevContext,
  DevHandle,
  BuildContext,
  BuildOutput,
  WatchHandle,
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

/**
 * Options every framework adapter built on {@link createHostServeable}
 * exposes publicly (`FastifyAdapterOptions`, `ExpressAdapterOptions`, …
 * each just `extends HostFrameworkOptions`).
 */
export interface HostFrameworkOptions {
  readonly entry: string
  /**
   * How `seam dev` runs the entry — always the raw source, never a
   * `buildTool`'s output (dev never builds). Independent of `runtime`: dev
   * and prod commonly want different runners, e.g. `devRuntime: 'nub'` for
   * fast iteration while `runtime` (or its default) runs the shipped build.
   * Defaults to `'tsx'`.
   */
  readonly devRuntime?: Runner
  /**
   * How `seam start` executes the entry point — whichever one applies (raw
   * source with no `buildTool`, or the compiled output with one). Orthogonal
   * to `buildTool`: `runtime: 'bun'` is meaningful whether or not a
   * `buildTool` is also set. Defaults to `'tsx'` with no `buildTool`,
   * `'node'` with one (unless the ambient runtime is `bun`/`deno`, which are
   * preferred over `node` too — both can run a compiled `.js` file
   * natively). Independent of `devRuntime` — `seam dev => nub, seam
   * build => webpack, seam start => node` is a perfectly sane combination.
   */
  readonly runtime?: Runner
  readonly watch?: WatchSetting
  /**
   * Full list of paths this backend serves. **Overrides** `defaultMountPath`:
   * if set, the resolver uses exactly these (so include `/api` yourself if
   * you want it). If unset, the host serves `defaultMountPath` only.
   * Each entry must start with `/` and not equal `/`.
   */
  readonly routes?: readonly string[]
  /**
   * Compile the server entry for production with this tool
   * (`fastify({ buildTool: tsc() })`). Unset (the default) means `seam
   * build` produces no compiled JS at all — `seam start` runs the TS entry
   * directly, same as `seam dev`. Once set, `seam start` requires its
   * compiled output to exist and errors instead of silently running source.
   */
  readonly buildTool?: BuildTool
}

export interface HostAdapterOptions extends HostFrameworkOptions {
  readonly framework: string
  readonly defaultMountPath: string
  readonly writeWireEnv: (input: HostWireInput) => Record<string, string>
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
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  let existing = ''
  for (const k of Object.keys(env)) {
    if (k.toLowerCase() === 'path') {
      if (env[k]) existing = env[k]
      if (k !== pathKey) delete env[k]
    }
  }
  env[pathKey] = existing ? `${binDir}${delimiter}${existing}` : binDir
  return env
}

type SpawnedChild = ResultPromise<{
  stdio: ['inherit', 'pipe', 'pipe']
  reject: false
  detached: true
}>

function spawnChild(
  bin: string,
  args: string[],
  env: Record<string, string>,
  cwd: string,
  member: string,
): SpawnedChild {
  const child = execa(bin, args, {
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

function spawnTsx(
  entryPath: string,
  env: Record<string, string>,
  cwd: string,
  watch: WatchSetting | undefined,
  member: string,
): SpawnedChild {
  return spawnChild('tsx', buildTsxArgs(entryPath, watch), env, cwd, member)
}

/**
 * Best-effort detection of the runtime that launched the `seam` process
 * itself — if a developer is already running everything through `bun`/`nub`/
 * `deno`, defaulting an uncompiled TS entry to `tsx` would be a needless
 * extra tool in the mix. Used for the "no explicit choice" default when
 * running raw source (`seam dev`, or `seam start` with no `buildTool`).
 *
 * Detects Bun/Deno directly (`process.versions.bun`, the global `Deno`
 * object), and otherwise falls back to sniffing `npm_config_user_agent` —
 * the same signal `create-seam`'s own `detectPackageManager()` uses — since
 * `bun run <script>`/`nub run <script>` still exec the CLI's `node` shebang
 * as a subprocess, so `process.versions.bun` alone won't catch that case.
 */
function detectAmbientRunner(): Runner | undefined {
  if (process.versions.bun) return 'bun'
  if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') return 'deno'
  const ua = process.env['npm_config_user_agent'] ?? ''
  if (ua.startsWith('bun')) return 'bun'
  if (ua.startsWith('nub')) return 'nub'
  if (ua.startsWith('deno')) return 'deno'
  return undefined
}

/**
 * Default runner for a *compiled* entry (a `buildTool` was set): plain
 * `'node'`, unless the ambient runtime is `bun` or `deno` — both are their
 * own engines capable of running a bundled/compiled `.js` file natively, so
 * prefer them over `node` the same way the uncompiled path prefers them
 * over `tsx`. `nub` doesn't count here: it's a package-manager alias, not a
 * distinct engine — the process underneath is still plain Node.
 */
function defaultCompiledRunner(): Runner {
  const ambient = detectAmbientRunner()
  return ambient === 'bun' || ambient === 'deno' ? ambient : 'node'
}

/**
 * Is `pkgName` resolvable from `cwd`? Uses Node's own resolution via
 * `createRequire` rather than poking at `node_modules/.bin` on disk — that
 * matters for Yarn PnP, which has no conventional `node_modules/.bin` at
 * all. PnP works by patching Node's module resolution *for the whole
 * process*, activated via `NODE_OPTIONS=--require .pnp.cjs` before `seam`
 * itself even starts (that's how `yarn dev` → `seam dev` gets it) — so by
 * the time this code runs, our own `require.resolve()` calls are *already*
 * going through the exact same PnP-aware resolution a real spawn would use.
 * No special-casing needed: whatever this returns is what actually resolves.
 *
 * Tries the package's `package.json` first (works even for packages with an
 * `exports` map that only exposes an ESM condition, since `package.json` is
 * commonly exempted or explicitly re-exported); falls back to the bare
 * specifier for packages that block that subpath entirely.
 */
function isPackageResolvable(cwd: string, pkgName: string): boolean {
  const req = createRequire(join(cwd, '__seam_resolve_probe__.js'))
  try {
    req.resolve(`${pkgName}/package.json`)
    return true
  } catch {
    try {
      req.resolve(pkgName)
      return true
    } catch {
      return false
    }
  }
}

/**
 * The `'tsx'` default, but verified — if `tsx` isn't actually installed,
 * spawning it would just fail with a confusing "command not found" from the
 * shell. Fail loudly here instead, with a fix a developer can act on
 * immediately (consistent with this file's "no silent fallback" stance).
 */
function defaultTsxRunner(cwd: string, framework: string): Runner {
  if (!isPackageResolvable(cwd, 'tsx')) {
    throw new Error(
      `[@seamstack/${framework}] tsx not found — install it ` +
        `("pnpm add -D tsx"/"npm i -D tsx"/"yarn add -D tsx"), or set \`runtime\`/\`devRuntime\` ` +
        `explicitly to run this entry a different way (e.g. 'bun', 'node' with a \`buildTool\`).`,
    )
  }
  return 'tsx'
}

/**
 * Spawns `entryPath` with the chosen {@link Runner}. `watch` only affects
 * `'tsx'` (the only runner with tsx-flavored watch flags today).
 */
function spawnRunner(
  runner: Runner,
  entryPath: string,
  env: Record<string, string>,
  cwd: string,
  watch: WatchSetting | undefined,
  member: string,
): SpawnedChild {
  switch (runner) {
    case 'tsx':
      return spawnTsx(entryPath, env, cwd, watch, member)
    case 'node':
      return spawnChild('node', [entryPath], env, cwd, member)
    case 'bun':
      return spawnChild('bun', ['run', entryPath], env, cwd, member)
    case 'nub':
      return spawnChild('nub', ['run', entryPath], env, cwd, member)
    case 'deno':
      return spawnChild('deno', ['run', '--allow-all', entryPath], env, cwd, member)
  }
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

/**
 * Naive fallback for {@link BuildTool}s that don't implement their own
 * `watch()`: rebuilds (debounced) on any change under `ctx.cwd`.
 */
function watchAndRebuild(tool: BuildTool, ctx: BuildToolContext): WatchHandle {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const scheduleRebuild = () => {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      void tool.build(ctx).catch(() => {
        /* surfaced to the user via the next spawned process; keep watching */
      })
    }, 100)
  }
  scheduleRebuild()
  const watcher = fsWatch(ctx.cwd, { recursive: true }, scheduleRebuild)
  return {
    stop() {
      stopped = true
      clearTimeout(timer)
      watcher.close()
    },
  }
}

interface ServerManifest {
  readonly assetsDir: string
  readonly indexHtml: string
  readonly serverEntry?: string
}

async function loadServerManifest(serverDir: string): Promise<ServerManifest | null> {
  const path = join(serverDir, '_seam_prod.js')
  if (!existsSync(path)) return null
  try {
    const mod = (await import(pathToFileURL(path).href)) as { default?: ServerManifest }
    return mod.default ?? null
  } catch {
    return null
  }
}

export function createHostServeable(opts: HostAdapterOptions): Serveable {
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
      const child = spawnRunner(
        opts.devRuntime ?? detectAmbientRunner() ?? defaultTsxRunner(ctx.cwd, opts.framework),
        entryFor(ctx.cwd),
        env,
        ctx.cwd,
        opts.watch ?? true,
        opts.framework,
      )
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
      const serverDir = join(ctx.outDir, 'server')
      await mkdir(serverDir, { recursive: true })

      const entryPath = entryFor(ctx.cwd)

      let serverEntry: string | undefined
      if (opts.buildTool) {
        const result = await opts.buildTool.build({ entryPath, serverDir, cwd: ctx.cwd })
        serverEntry = relative(serverDir, result.entryPath)
      }

      const manifest = {
        assetsDir: relative(serverDir, peer.assetsDir),
        indexHtml: relative(serverDir, peer.indexHtml),
        ...(serverEntry ? { serverEntry } : {}),
      }
      const content = `export default ${JSON.stringify(manifest, null, 2)}\n`
      await writeFile(join(serverDir, '_seam_prod.js'), content, 'utf8')
      return {}
    },
    async watch(ctx: BuildContext): Promise<WatchHandle> {
      const serverDir = join(ctx.outDir, 'server')
      await mkdir(serverDir, { recursive: true })

      const entryPath = entryFor(ctx.cwd)

      if (!opts.buildTool) return { stop: () => {} }

      const buildToolCtx: BuildToolContext = { entryPath, serverDir, cwd: ctx.cwd }
      if (opts.buildTool.watch) {
        return opts.buildTool.watch(buildToolCtx, () => {})
      }
      return watchAndRebuild(opts.buildTool, buildToolCtx)
    },
    async start(ctx: StartContext): Promise<StartHandle> {
      const serverDir = join(ctx.outDir, 'server')

      const wire = opts.writeWireEnv({
        mode: ctx.mode,
        host: ctx.publicHost,
        port: ctx.assignedPort,
        distDir: serverDir,
      })
      const env = buildSpawnEnv(ctx.cwd, wire)

      let child: SpawnedChild
      if (opts.buildTool) {
        const manifest = await loadServerManifest(serverDir)
        const compiledEntry = manifest?.serverEntry ? join(serverDir, manifest.serverEntry) : undefined
        if (!compiledEntry || !existsSync(compiledEntry)) {
          throw new Error(
            `[@seamstack/${opts.framework}] No compiled server entry found — run \`seam build\` first.`,
          )
        }
        child = spawnRunner(
          opts.runtime ?? defaultCompiledRunner(),
          compiledEntry,
          env,
          ctx.cwd,
          undefined,
          opts.framework,
        )
      } else {
        child = spawnRunner(
          opts.runtime ?? detectAmbientRunner() ?? defaultTsxRunner(ctx.cwd, opts.framework),
          entryFor(ctx.cwd),
          env,
          ctx.cwd,
          undefined,
          opts.framework,
        )
      }
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
