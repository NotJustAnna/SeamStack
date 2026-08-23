#!/usr/bin/env node
import { resolve } from 'node:path'
import { cac } from 'cac'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { runPrompts } from './prompts.js'
import {
  detectPackageManager,
  isDirNonEmpty,
  scaffold,
  type PackageManager,
} from './scaffold.js'
import {
  ADDONS,
  ASTRO_UIS,
  BACKENDS,
  BUILD_TOOLS,
  HOSTS,
  RUNTIMES,
  VARIANTS,
  VITE_UIS,
  type Addon,
  type Backend,
  type BuildTool,
  type Host,
  type ProjectSpec,
  type Runtime,
  type Variant,
} from './engine/spec.js'

const PMS = ['pnpm', 'npm', 'yarn', 'bun', 'nub'] as const

interface CliFlags {
  /** New: replaces --frontend. */
  host?: string
  /** Deprecated alias of --host. */
  frontend?: string
  ui?: string
  variant?: string
  backend?: string
  buildTool?: string
  runtime?: string
  addons?: string
  install?: boolean
  git?: boolean
  pm?: string
  force?: boolean
}

const cli = cac('create-seam')

cli
  .command('[name]', 'Scaffold a new SeamStack project')
  .option('--host <name>', `Frontend host (${HOSTS.join('|')})`)
  .option('--frontend <name>', '[deprecated] alias of --host')
  .option(
    '--ui <names>',
    `UI framework (vite: one of ${VITE_UIS.join('|')}; astro: comma-separated subset of ${ASTRO_UIS.join('|')}, or omit for vanilla Astro)`,
  )
  .option('--variant <variant>', `Language variant (${VARIANTS.join('|')})`)
  .option('--backend <name>', `Backend (${BACKENDS.join('|')})`)
  .option('--build-tool <name>', `Compile/bundle the backend with this tool (${BUILD_TOOLS.join('|')})`)
  .option('--runtime <name>', `Runtime for \`seam start\` (${RUNTIMES.join('|')})`)
  .option('--addons <names>', `Comma-separated addons (${ADDONS.join('|')})`)
  .option('--no-install', 'Skip installing dependencies')
  .option('--no-git', 'Skip initializing a git repository')
  .option('--pm <name>', `Package manager (${PMS.join('|')})`)
  .option('--force', 'Overwrite a non-empty target directory')
  .action(async (name: string | undefined, flags: CliFlags) => {
    try {
      await runCli(name, flags)
    } catch (err) {
      p.log.error((err as Error).message)
      process.exit(1)
    }
  })

cli.help()
cli.version('0.3.0')
cli.parse()

async function runCli(rawName: string | undefined, flags: CliFlags): Promise<void> {
  const cwd = process.cwd()
  const pm = pickEnum(flags.pm, PMS, '--pm') ?? detectPackageManager()

  if (flags.frontend && !flags.host) {
    p.log.warn(pc.yellow('--frontend is deprecated; use --host instead.'))
    flags.host = flags.frontend
  }

  const host = pickEnum(flags.host, HOSTS, '--host') as Host | undefined
  const variant = pickEnum(flags.variant, VARIANTS, '--variant') as Variant | undefined
  const backend = pickEnum(flags.backend, BACKENDS, '--backend') as Backend | undefined
  const buildTool = pickEnum(flags.buildTool, BUILD_TOOLS, '--build-tool') as BuildTool | undefined
  const runtime = pickEnum(flags.runtime, RUNTIMES, '--runtime') as Runtime | undefined
  const addons = parseAddons(flags.addons)
  const ui = parseUi(flags.ui, host)

  const headless = !!rawName && !!host && !!backend && !process.stdin.isTTY

  let spec: ProjectSpec
  let targetDir: string
  let install: boolean
  let git: boolean
  let force: boolean

  if (headless) {
    targetDir = resolve(cwd, rawName!)
    if ((await isDirNonEmpty(targetDir)) && !flags.force) {
      throw new Error(`Directory ${rawName} is not empty. Use --force to overwrite.`)
    }
    spec = {
      name: rawName!,
      host: host!,
      ui: defaultUiFor(ui, host!),
      variant: variant ?? 'ts',
      backend: backend!,
      addons,
      buildTool,
      runtime,
    }
    install = flags.install ?? true
    git = flags.git ?? true
    force = flags.force ?? false
  } else {
    const r = await runPrompts({
      cwd,
      name: rawName,
      host,
      ui,
      variant,
      backend,
      buildTool,
      runtime,
      addons: flags.addons !== undefined ? addons : undefined,
      install: flags.install,
      git: flags.git,
      pm,
      force: flags.force ?? false,
    })
    spec = r.spec
    targetDir = r.targetDir
    install = r.install
    git = r.git
    force = r.force
  }

  const result = await scaffold({ spec, targetDir, install, git, pm, force })
  p.outro(buildOutro({ name: spec.name, pm, install, installFailed: result.installFailed }))
}

function defaultUiFor(
  parsed: string | string[] | undefined,
  host: Host,
): string | string[] | null {
  if (parsed !== undefined) return parsed
  if (host === 'angular') return null
  if (host === 'vite') return 'react'
  // Astro can run with just `.astro` files; default to zero UIs.
  return []
}

function parseUi(value: string | undefined, host: Host | undefined): string | string[] | undefined {
  if (value === undefined) return undefined
  if (host === 'astro') return value.split(',').map((s) => s.trim()).filter(Boolean)
  return value.trim()
}

function parseAddons(value: string | undefined): Addon[] {
  if (!value) return []
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean)
  for (const a of parts) {
    if (!(ADDONS as readonly string[]).includes(a)) {
      throw new Error(`Invalid --addons entry: ${a} (allowed: ${ADDONS.join(', ')})`)
    }
  }
  return parts as Addon[]
}

function buildOutro(opts: {
  name: string
  pm: PackageManager
  install: boolean
  installFailed: boolean
}): string {
  const title = opts.installFailed ? pc.yellow('Seamed up, but install failed') : pc.green('All seamed up!')
  const lines = [title, '', pc.dim('Next:'), `  cd ${opts.name}`]
  if (!opts.install || opts.installFailed) lines.push(`  ${opts.pm} install`)
  const devCmd = opts.pm === 'npm' || opts.pm === 'nub' ? `${opts.pm} run dev` : `${opts.pm} dev`
  lines.push(`  ${devCmd}`)
  return lines.join('\n')
}

function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flagName: string,
): T | undefined {
  if (value === undefined) return undefined
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid ${flagName}: ${value} (allowed: ${allowed.join(', ')})`)
  }
  return value as T
}
