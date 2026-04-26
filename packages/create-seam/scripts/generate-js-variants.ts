/**
 * Generates a JS sibling tree from a TS source tree by stripping types via
 * regex (best-effort). Used by `build-templates.ts` to derive `files-js/`
 * for layers that opt in via `hasJsVariant: true`.
 *
 * The stripper logic itself lives in `src/engine/strip-types.ts` so it can be
 * reused at scaffold time. This script wraps the file-tree walk + extension
 * renaming on top of it.
 */
import { existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsExtensionFor, stripTypes, stripTypesFromHtml } from '../src/engine/strip-types.js'

export async function generateJsVariants(srcDir: string, dstDir: string): Promise<void> {
  if (!existsSync(srcDir)) return
  await fs.rm(dstDir, { recursive: true, force: true })
  await processDir(srcDir, dstDir)
}

async function processDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkip(entry.name, entry.isDirectory())) continue

    const srcPath = join(from, entry.name)
    const destName = entry.isFile() ? jsExtensionFor(entry.name) : entry.name
    const dstPath = join(to, destName)

    if (entry.isDirectory()) {
      await processDir(srcPath, dstPath)
    } else if (entry.isFile()) {
      await processFile(srcPath, dstPath, entry.name)
    }
  }
}

function shouldSkip(name: string, isDir: boolean): boolean {
  if (name === 'node_modules' || name === 'dist') return true
  if (isDir && name.startsWith('.')) return true
  if (name === 'tsconfig.json') return true
  return false
}

async function processFile(srcPath: string, dstPath: string, name: string): Promise<void> {
  if (name === 'index.html') {
    const html = await fs.readFile(srcPath, 'utf8')
    await fs.mkdir(dirname(dstPath), { recursive: true })
    await fs.writeFile(dstPath, stripTypesFromHtml(html), 'utf8')
    return
  }

  if (/\.(ts|tsx)$/.test(name)) {
    const src = await fs.readFile(srcPath, 'utf8')
    await fs.mkdir(dirname(dstPath), { recursive: true })
    await fs.writeFile(dstPath, stripTypes(src), 'utf8')
    return
  }

  await fs.mkdir(dirname(dstPath), { recursive: true })
  await fs.copyFile(srcPath, dstPath)
}

const here = dirname(fileURLToPath(import.meta.url))
const LAYERS_SRC = join(here, '..', 'layers')

async function cli(): Promise<void> {
  const queue: string[] = [LAYERS_SRC]
  let count = 0
  while (queue.length > 0) {
    const dir = queue.shift()!
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      if (entry.name === 'files' || entry.name === 'files-ts' || entry.name === 'files-js') continue
      queue.push(join(dir, entry.name))
    }
    const manifestPath = join(dir, '_layer.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
      hasJsVariant?: boolean
    }
    if (!manifest.hasJsVariant) continue
    const tsDir = join(dir, 'files-ts')
    const jsDir = join(dir, 'files-js')
    if (!existsSync(tsDir)) continue
    await generateJsVariants(tsDir, jsDir)
    count += 1
    console.log(`✓ ${dir.replace(LAYERS_SRC + '/', '')}: files-ts/ → files-js/`)
  }
  console.log(`Generated JS variants for ${count} layer(s).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  cli().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
