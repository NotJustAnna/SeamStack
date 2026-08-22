import { existsSync, promises as fs } from 'node:fs'
import { compareVersions } from '../version.js'

export interface PackageJson {
  name?: string
  version?: string
  type?: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  allowScripts?: Record<string, boolean>
  [k: string]: unknown
}

export interface DepCollision {
  name: string
  losingVersion: string
  winningVersion: string
  origin: string
}

export interface DepMergeOptions {
  warn?: (msg: string) => void
}

/**
 * Merges layer-contributed deps into a target `package.json` already on disk.
 * Higher-precedence layers win on collisions for `scripts` and `pkgOverrides`;
 * for deps we pick the higher semver-ish version and surface a warning.
 */
export async function mergeIntoPackageJson(
  pkgPath: string,
  patches: Array<{
    deps?: Record<string, string>
    devDeps?: Record<string, string>
    peerDeps?: Record<string, string>
    onlyBuiltDeps?: string[]
    scripts?: Record<string, string>
    pkgOverrides?: Record<string, unknown>
    origin: string
  }>,
  opts: DepMergeOptions = {},
): Promise<{ onlyBuiltDependencies: string[] }> {
  const pkg = existsSync(pkgPath)
    ? (JSON.parse(await fs.readFile(pkgPath, 'utf8')) as PackageJson)
    : {}

  const dependencies = pkg.dependencies ?? {}
  const devDependencies = pkg.devDependencies ?? {}
  const peerDependencies = pkg.peerDependencies ?? {}
  const scripts = pkg.scripts ?? {}
  const onlyBuiltDependencies = new Set(Object.keys(pkg.allowScripts ?? {}))

  for (const patch of patches) {
    mergeDeps(dependencies, patch.deps, patch.origin, opts.warn)
    mergeDeps(devDependencies, patch.devDeps, patch.origin, opts.warn)
    mergeDeps(peerDependencies, patch.peerDeps, patch.origin, opts.warn)
    for (const name of patch.onlyBuiltDeps ?? []) onlyBuiltDependencies.add(name)
    if (patch.scripts) {
      for (const [k, v] of Object.entries(patch.scripts)) scripts[k] = v
    }
    if (patch.pkgOverrides) {
      for (const [k, v] of Object.entries(patch.pkgOverrides)) {
        if (v === undefined) delete (pkg as Record<string, unknown>)[k]
        else (pkg as Record<string, unknown>)[k] = v
      }
    }
  }

  if (Object.keys(dependencies).length) pkg.dependencies = sortObject(dependencies)
  if (Object.keys(devDependencies).length) pkg.devDependencies = sortObject(devDependencies)
  if (Object.keys(peerDependencies).length) pkg.peerDependencies = sortObject(peerDependencies)
  if (Object.keys(scripts).length) pkg.scripts = scripts
  if (onlyBuiltDependencies.size) {
    // npm (12+) reads its own build-script allowlist straight from package.json,
    // unlike pnpm which requires pnpm-workspace.yaml — see writePnpmWorkspaceYaml.
    pkg.allowScripts = sortObject(
      Object.fromEntries([...onlyBuiltDependencies].map((name) => [name, true])),
    )
  }

  await fs.writeFile(pkgPath, JSON.stringify(orderPackageJson(pkg), null, 2) + '\n', 'utf8')

  return { onlyBuiltDependencies: [...onlyBuiltDependencies].sort() }
}

const PKG_FIELD_ORDER = [
  'name',
  'version',
  'description',
  'private',
  'type',
  'main',
  'module',
  'types',
  'exports',
  'bin',
  'files',
  'scripts',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'allowScripts',
  'engines',
  'keywords',
  'author',
  'license',
] as const

function orderPackageJson(pkg: PackageJson): PackageJson {
  const out: Record<string, unknown> = {}
  for (const k of PKG_FIELD_ORDER) {
    if (k in pkg) out[k] = (pkg as Record<string, unknown>)[k]
  }
  for (const k of Object.keys(pkg)) {
    if (!(k in out)) out[k] = (pkg as Record<string, unknown>)[k]
  }
  return out as PackageJson
}

function mergeDeps(
  target: Record<string, string>,
  patch: Record<string, string> | undefined,
  origin: string,
  warn: ((msg: string) => void) | undefined,
): void {
  if (!patch) return
  for (const [name, version] of Object.entries(patch)) {
    const current = target[name]
    if (!current) {
      target[name] = version
      continue
    }
    const cmp = compareVersions(current, version)
    if (cmp >= 0) {
      if (cmp > 0 && warn) {
        warn(`dep ${name}: keeping ${current} (incoming ${version} from ${origin} is older)`)
      }
      continue
    }
    if (warn) warn(`dep ${name}: bumping ${current} → ${version} (from ${origin})`)
    target[name] = version
  }
}

function sortObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(obj).sort()) out[k] = obj[k]
  return out as T
}
