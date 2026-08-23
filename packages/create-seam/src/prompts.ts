import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  ADDON_HINT,
  ADDON_LABEL,
  ASTRO_UI_LABEL,
  BACKEND_LABEL,
  BUILD_STRATEGY_HINT,
  BUILD_STRATEGY_LABEL,
  BUILD_TOOL_HINT,
  BUILD_TOOL_LABEL,
  HOST_HINT,
  HOST_LABEL,
  RUNTIME_HINT,
  RUNTIME_LABEL,
  VITE_UI_LABEL,
} from './engine/catalog.js'
import { isAddonCompatible } from './engine/compatibility.js'
import {
  ADDONS,
  ASTRO_UIS,
  BACKENDS,
  defaultRuntimeFor,
  forcedNoBuildStrategyReason,
  forcedVariantReason,
  HOSTS,
  runtimeOptionsFor,
  VITE_UIS,
  type Addon,
  type AstroUi,
  type Backend,
  type BuildStrategy,
  type BuildTool,
  type Host,
  type ProjectSpec,
  type Runtime,
  type Variant,
  type ViteUi,
} from './engine/spec.js'
import type { PackageManager } from './scaffold.js'
import { isDirNonEmpty } from './scaffold.js'

export interface PromptInput {
  cwd: string
  name?: string
  host?: Host
  ui?: string | string[]
  variant?: Variant
  backend?: Backend
  buildTool?: BuildTool
  runtime?: Runtime
  addons?: Addon[]
  install?: boolean
  git?: boolean
  pm: PackageManager
  force: boolean
}

export interface PromptResult {
  spec: ProjectSpec
  targetDir: string
  install: boolean
  git: boolean
  pm: PackageManager
  force: boolean
}

export async function runPrompts(input: PromptInput): Promise<PromptResult> {
  p.intro(`${pc.bold(pc.cyan('create-seam'))} ${pc.dim('— ready for a seamless fullstack experience?')}`)

  const name = await ensureName(input.name)
  const targetDir = resolve(input.cwd, name)

  if (!input.force && (await isDirNonEmpty(targetDir))) {
    const proceed = await p.confirm({
      message: `Directory ${pc.yellow(name)} is not empty. Continue and overwrite files?`,
      initialValue: false,
    })
    if (p.isCancel(proceed) || !proceed) cancel()
  }

  const host = await ensureHost(input.host)
  const ui = await ensureUi(input.ui, host)
  const backend = await ensureBackend(input.backend)
  const variant = await ensureVariant(input.variant, host, backend)
  const { buildTool, runtime } = await ensureBuildStrategy(input.buildTool, input.runtime, backend, variant)

  const partialSpec: ProjectSpec = {
    name,
    host,
    ui,
    variant,
    backend,
    addons: [],
    buildTool,
    runtime,
  }

  const addons = await ensureAddons(input.addons, partialSpec)
  const install = await ensureInstall(input.install, input.pm)
  const git = await ensureGit(input.git)

  return {
    spec: { ...partialSpec, addons },
    targetDir,
    install,
    git,
    pm: input.pm,
    force: input.force,
  }
}

async function ensureName(initial: string | undefined): Promise<string> {
  if (initial) return initial
  const value = await p.text({
    message: 'Project name?',
    placeholder: 'seam-app',
    defaultValue: 'seam-app',
    validate: (v) => {
      const candidate = (v ?? '').trim() || 'seam-app'
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(candidate)) {
        return 'Use letters, digits, dashes, or underscores; must start with a letter or digit'
      }
      return undefined
    },
  })
  if (p.isCancel(value)) cancel()
  return ((value as string) || 'seam-app').trim()
}

async function ensureHost(initial: Host | undefined): Promise<Host> {
  if (initial) return initial
  const value = await p.select({
    message: 'Pick a frontend fabric',
    options: HOSTS.map((h) => ({
      value: h,
      label: HOST_LABEL[h],
      hint: HOST_HINT[h],
    })),
    initialValue: 'vite' as Host,
  })
  if (p.isCancel(value)) cancel()
  return value as Host
}

async function ensureUi(
  initial: string | string[] | undefined,
  host: Host,
): Promise<string | string[] | null> {
  if (host === 'angular') return null
  if (initial !== undefined) return initial

  if (host === 'vite') {
    const value = await p.select({
      message: 'Pick a UI for Vite',
      options: VITE_UIS.map((u) => ({ value: u, label: VITE_UI_LABEL[u] })),
      initialValue: 'react' as ViteUi,
    })
    if (p.isCancel(value)) cancel()
    return value as string
  }

  const value = await p.multiselect({
    message: 'Pick UI integrations for Astro (none = vanilla, space to toggle, enter to confirm)',
    options: ASTRO_UIS.map((u) => ({ value: u, label: ASTRO_UI_LABEL[u] })),
    required: false,
    initialValues: [] as AstroUi[],
  })
  if (p.isCancel(value)) cancel()
  return value as string[]
}

async function ensureVariant(
  initial: Variant | undefined,
  host: Host,
  backend: Backend,
): Promise<Variant> {
  const reason = forcedVariantReason(host, backend)
  if (reason) {
    if (initial === 'js') {
      throw new Error(`--variant js is incompatible with this choice of host/backend: ${reason}.`)
    }
    p.log.info(`${reason} — using TypeScript.`)
    return 'ts'
  }

  if (initial) return initial
  const value = await p.select({
    message: 'Language? (applies to the whole project — frontend and backend together)',
    options: [
      { value: 'ts', label: 'TypeScript' },
      { value: 'js', label: 'JavaScript' },
    ],
    initialValue: 'ts' as Variant,
  })
  if (p.isCancel(value)) cancel()
  return value as Variant
}

async function ensureBackend(initial: Backend | undefined): Promise<Backend> {
  if (initial) return initial
  const value = await p.select({
    message: 'Pick a backend fabric',
    options: BACKENDS.map((b) => ({ value: b, label: BACKEND_LABEL[b] })),
    initialValue: 'hono' as Backend,
  })
  if (p.isCancel(value)) cancel()
  return value as Backend
}

const BUNDLERS = ['esbuild', 'rollup', 'rolldown', 'webpack'] as const satisfies readonly BuildTool[]
const COMPILERS = ['tsc', 'swc', 'oxc'] as const satisfies readonly BuildTool[]

/** What launched `create-seam` itself — distinct from `@seamstack/core`'s own ambient detection at serve time. */
function detectAmbientRuntime(): Runtime | undefined {
  if (process.versions.bun) return 'bun'
  if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') return 'deno'
  const ua = process.env['npm_config_user_agent'] ?? ''
  if (ua.startsWith('bun')) return 'bun'
  if (ua.startsWith('nub')) return 'nub'
  if (ua.startsWith('deno')) return 'deno'
  return undefined
}

function isRuntimeAvailable(bin: string): boolean {
  try {
    const result = spawnSync(bin, ['--version'], { stdio: 'ignore', timeout: 1500 })
    return !result.error && result.status === 0
  } catch {
    return false
  }
}

/**
 * Preselects the runtime option for the "no build" path: prefer whatever
 * actually launched `create-seam` (strongest signal), else probe the machine
 * for bun/nub/deno actually being installed, else fall back to the variant's
 * zero-config default. Only a preselection — the prompt still asks.
 */
function preselectRuntime(options: readonly Runtime[], variant: Variant): Runtime {
  const ambient = detectAmbientRuntime()
  if (ambient && options.includes(ambient)) return ambient
  for (const candidate of ['bun', 'nub', 'deno'] as const) {
    if (options.includes(candidate) && isRuntimeAvailable(candidate)) return candidate
  }
  return defaultRuntimeFor(variant)
}

async function ensureBuildStrategy(
  initialBuildTool: BuildTool | undefined,
  initialRuntime: Runtime | undefined,
  backend: Backend,
  variant: Variant,
): Promise<{ buildTool?: BuildTool; runtime?: Runtime }> {
  const forcedReason = forcedNoBuildStrategyReason(backend)
  if (forcedReason) {
    if (initialBuildTool !== undefined || initialRuntime !== undefined) {
      throw new Error(`--build-tool/--runtime are incompatible with this backend: ${forcedReason}.`)
    }
    p.log.info(`${forcedReason} — skipping build/runtime configuration.`)
    return {}
  }

  if (initialBuildTool !== undefined || initialRuntime !== undefined) {
    return { buildTool: initialBuildTool, runtime: initialRuntime }
  }

  const categories = [
    { value: 'none' as BuildStrategy, label: BUILD_STRATEGY_LABEL.none, hint: BUILD_STRATEGY_HINT.none },
    { value: 'bundle' as BuildStrategy, label: BUILD_STRATEGY_LABEL.bundle, hint: BUILD_STRATEGY_HINT.bundle },
    ...(variant === 'ts'
      ? [{ value: 'compile' as BuildStrategy, label: BUILD_STRATEGY_LABEL.compile, hint: BUILD_STRATEGY_HINT.compile }]
      : []),
  ]
  const category = await p.select({
    message: 'How should the backend be built and run?',
    options: categories,
    initialValue: 'none' as BuildStrategy,
  })
  if (p.isCancel(category)) cancel()

  if (category === 'none') {
    const options = runtimeOptionsFor(variant)
    const runtime = await p.select({
      message: 'Runtime for `seam start`?',
      options: options.map((r) => ({ value: r, label: RUNTIME_LABEL[r], hint: RUNTIME_HINT[r] })),
      initialValue: preselectRuntime(options, variant),
    })
    if (p.isCancel(runtime)) cancel()
    return { runtime: runtime as Runtime }
  }

  const tools = category === 'bundle' ? BUNDLERS : COMPILERS
  const defaultTool: BuildTool = category === 'bundle' ? 'esbuild' : 'tsc'
  const buildTool = await p.select({
    message: category === 'bundle' ? 'Which bundler?' : 'Which compiler?',
    options: tools.map((t) => ({ value: t, label: BUILD_TOOL_LABEL[t], hint: BUILD_TOOL_HINT[t] })),
    initialValue: defaultTool,
  })
  if (p.isCancel(buildTool)) cancel()
  return { buildTool: buildTool as BuildTool }
}

async function ensureAddons(
  initial: Addon[] | undefined,
  spec: ProjectSpec,
): Promise<Addon[]> {
  if (initial !== undefined) return initial
  const candidates = ADDONS.filter((a) => isAddonCompatible(spec, a))
  if (candidates.length === 0) return []
  const value = await p.multiselect({
    message: 'Optional addons (space to toggle, enter to confirm)',
    options: candidates.map((a) => ({
      value: a,
      label: ADDON_LABEL[a],
      hint: ADDON_HINT[a],
    })),
    required: false,
    initialValues: [] as Addon[],
  })
  if (p.isCancel(value)) cancel()
  return value as Addon[]
}

async function ensureInstall(
  initial: boolean | undefined,
  pm: PackageManager,
): Promise<boolean> {
  if (initial !== undefined) return initial
  const value = await p.confirm({
    message: `Install dependencies with ${pc.cyan(pm)}?`,
    initialValue: true,
  })
  if (p.isCancel(value)) cancel()
  return value
}

async function ensureGit(initial: boolean | undefined): Promise<boolean> {
  if (initial !== undefined) return initial
  const value = await p.confirm({
    message: 'Initialize a git repository?',
    initialValue: true,
  })
  if (p.isCancel(value)) cancel()
  return value
}

function cancel(): never {
  p.cancel('Cancelled.')
  process.exit(0)
}
