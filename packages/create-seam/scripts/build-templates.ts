/**
 * Builds the layer tree into `dist/layers/` for distribution:
 *   1. Walks every `<pkg>/layers/<id>/` source dir.
 *   2. Resolves `workspace:*` deps in each `_layer.json` against the monorepo
 *      package versions (so the published create-seam ships with concrete
 *      versions, not workspace refs).
 *   3. Copies static files (`files/`, `files-ts/`) over to `dist/layers/<id>/`.
 *   4. For layers with `hasJsVariant: true`, generates a `files-js/` sibling
 *      from `files-ts/` via the regex stripper.
 */
import { existsSync, promises as fs } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateJsVariants } from './generate-js-variants.js'

const here = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(here, '..')
const REPO_ROOT = resolve(PKG_DIR, '..', '..')
const LAYERS_SRC = join(PKG_DIR, 'layers')
const LAYERS_DEST = join(PKG_DIR, 'dist', 'layers')

interface LayerManifest {
  hasJsVariant?: boolean
  deps?: Record<string, string>
  devDeps?: Record<string, string>
  peerDeps?: Record<string, string>
  [k: string]: unknown
}

async function buildVersionMap(): Promise<Record<string, string>> {
  const packagesDir = join(REPO_ROOT, 'packages')
  const map: Record<string, string> = {}
  const entries = await fs.readdir(packagesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pkgPath = join(packagesDir, entry.name, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      name?: string
      version?: string
    }
    if (pkg.name && pkg.version) {
      map[pkg.name] = `^${pkg.version}`
    }
  }
  return map
}

function rewriteDeps(
  deps: Record<string, string> | undefined,
  versionMap: Record<string, string>,
  layerId: string,
): void {
  if (!deps) return
  for (const [name, value] of Object.entries(deps)) {
    if (typeof value === 'string' && value.startsWith('workspace:')) {
      const concrete = versionMap[name]
      if (!concrete) {
        throw new Error(
          `[${layerId}] cannot resolve ${name}@${value} — no matching package in /packages`,
        )
      }
      deps[name] = concrete
    }
  }
}

async function copyTree(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkip(entry.name, entry.isDirectory())) continue
    const src = join(from, entry.name)
    const dst = join(to, entry.name)
    if (entry.isDirectory()) {
      await copyTree(src, dst)
    } else if (entry.isFile()) {
      await fs.mkdir(dirname(dst), { recursive: true })
      await fs.copyFile(src, dst)
    }
  }
}

function shouldSkip(name: string, isDir: boolean): boolean {
  if (name === 'node_modules' || name === 'dist') return true
  if (isDir && name.startsWith('.')) return true
  return false
}

async function findLayerDirs(root: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(root, { withFileTypes: true })
  if (existsSync(join(root, '_layer.json'))) out.push(prefix)
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue
    if (e.name === 'files' || e.name === 'files-ts' || e.name === 'files-js') continue
    const sub = await findLayerDirs(join(root, e.name), prefix ? `${prefix}/${e.name}` : e.name)
    out.push(...sub)
  }
  return out
}

async function buildLayer(
  layerId: string,
  versionMap: Record<string, string>,
): Promise<void> {
  const srcDir = join(LAYERS_SRC, layerId)
  const dstDir = join(LAYERS_DEST, layerId)

  const manifestPath = join(srcDir, '_layer.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as LayerManifest

  rewriteDeps(manifest.deps, versionMap, layerId)
  rewriteDeps(manifest.devDeps, versionMap, layerId)
  rewriteDeps(manifest.peerDeps, versionMap, layerId)

  await fs.mkdir(dstDir, { recursive: true })
  await fs.writeFile(join(dstDir, '_layer.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  await copyTree(join(srcDir, 'files'), join(dstDir, 'files'))
  await copyTree(join(srcDir, 'files-ts'), join(dstDir, 'files-ts'))

  if (manifest.hasJsVariant) {
    await generateJsVariants(join(srcDir, 'files-ts'), join(dstDir, 'files-js'))
  }
}

async function main(): Promise<void> {
  if (!existsSync(LAYERS_SRC)) {
    console.error(`No layers directory at ${LAYERS_SRC}`)
    process.exit(1)
  }
  const versionMap = await buildVersionMap()
  await fs.rm(LAYERS_DEST, { recursive: true, force: true })

  const layerIds = (await findLayerDirs(LAYERS_SRC)).sort()
  for (const id of layerIds) {
    await buildLayer(id, versionMap)
  }
  console.log(`✓ Built ${layerIds.length} layers → ${relative(PKG_DIR, LAYERS_DEST)}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
