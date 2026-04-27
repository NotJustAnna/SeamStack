import { promises as fs, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..', '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')

export interface PublishedSet {
  registryUrl: string
  matrixVersion: string
  packages: Array<{ name: string; pkgDir: string }>
}

interface DiscoveredPkg {
  name: string
  pkgDir: string
  pkgJsonPath: string
  originalContent: string
}

function discoverWorkspacePackages(): DiscoveredPkg[] {
  const out: DiscoveredPkg[] = []
  for (const entry of readdirSync(PACKAGES_DIR)) {
    const pkgDir = join(PACKAGES_DIR, entry)
    if (!statSync(pkgDir).isDirectory()) continue
    const pkgJsonPath = join(pkgDir, 'package.json')
    let raw: string
    try {
      raw = readFileSync(pkgJsonPath, 'utf8')
    } catch {
      continue
    }
    let parsed: { name?: string; private?: boolean }
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    if (!parsed.name) continue
    if (parsed.private === true) continue
    out.push({ name: parsed.name, pkgDir, pkgJsonPath, originalContent: raw })
  }
  return out
}

function rewriteWorkspaceDeps(pkg: Record<string, unknown>, matrixVersion: string): void {
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field] as Record<string, string> | undefined
    if (!deps) continue
    for (const [name, ver] of Object.entries(deps)) {
      // workspace:* gets rewritten to the current matrix version. Stale matrix
      // versions left over from a crashed prior run also get rewritten — they'd
      // otherwise resolve to a tarball that no longer exists in this run's
      // verdaccio storage.
      if (ver.startsWith('workspace:') || ver.startsWith('0.0.0-matrix-')) {
        deps[name] = matrixVersion
      }
    }
  }
}

export async function publishWorkspace(registryUrl: string, token: string): Promise<PublishedSet> {
  const matrixVersion = `0.0.0-matrix-${Date.now()}`
  const discovered = discoverWorkspacePackages()
  const restorers: Array<() => Promise<void>> = []
  const published: Array<{ name: string; pkgDir: string }> = []

  try {
    for (const d of discovered) {
      const json = JSON.parse(d.originalContent) as Record<string, unknown>
      json.version = matrixVersion
      rewriteWorkspaceDeps(json, matrixVersion)
      // Remove pre/postpublish scripts that may try to do unwanted work.
      const scripts = json.scripts as Record<string, string> | undefined
      if (scripts) {
        delete scripts.prepublishOnly
        delete scripts.prepublish
        delete scripts.postpublish
      }
      await fs.writeFile(d.pkgJsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8')
      restorers.push(() => fs.writeFile(d.pkgJsonPath, d.originalContent, 'utf8'))
    }

    for (const d of discovered) {
      const npmrcPath = join(d.pkgDir, '.npmrc.matrix')
      const registryHost = registryUrl.replace(/^https?:/, '')
      const npmrc = [
        `registry=${registryUrl}`,
        `${registryHost}/:_authToken=${token}`,
        `always-auth=true`,
        ``,
      ].join('\n')
      await fs.writeFile(npmrcPath, npmrc, 'utf8')

      try {
        const result = await execa(
          'npm',
          ['publish', '--registry', registryUrl, '--userconfig', npmrcPath, '--tag', 'matrix', '--access', 'public', '--ignore-scripts'],
          { cwd: d.pkgDir, reject: false, all: true },
        )
        if (result.exitCode !== 0) {
          throw new Error(`npm publish failed for ${d.name}:\n${result.all ?? result.stderr}`)
        }
        published.push({ name: d.name, pkgDir: d.pkgDir })
      } finally {
        await fs.rm(npmrcPath, { force: true })
      }
    }
  } finally {
    for (const r of restorers.reverse()) {
      try { await r() } catch { /* best effort */ }
    }
  }

  return { registryUrl, matrixVersion, packages: published }
}
