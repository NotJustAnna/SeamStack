import { resolve } from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  ADDON_HINT,
  ADDON_LABEL,
  ASTRO_UI_LABEL,
  BACKEND_LABEL,
  HOST_HINT,
  HOST_LABEL,
  VITE_UI_LABEL,
} from './engine/catalog.js'
import { isAddonCompatible } from './engine/compatibility.js'
import {
  ADDONS,
  ASTRO_UIS,
  BACKENDS,
  forcedVariantReason,
  HOSTS,
  VITE_UIS,
  type Addon,
  type AstroUi,
  type Backend,
  type Host,
  type ProjectSpec,
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

  const partialSpec: ProjectSpec = {
    name,
    host,
    ui,
    variant,
    backend,
    addons: [],
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
