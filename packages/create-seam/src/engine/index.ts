import { existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateSpec } from './compatibility.js'
import { renderAstroConfig } from './generators/astro-config.js'
import { writeAngularJson } from './generators/angular-config.js'
import { renderSeamConfig } from './generators/seam-config.js'
import { renderTsconfig } from './generators/tsconfig.js'
import { renderViteConfig } from './generators/vite-config.js'
import { resolveLayers, type LayerRef } from './layers.js'
import type {
  AngularConfigFragment,
  AstroConfigFragment,
  LayerManifest,
  SeamConfigFragment,
  ViteConfigFragment,
} from './manifest.js'
import { copyTree } from './merge/copy.js'
import { mergeIntoPackageJson } from './merge/json.js'
import type { ProjectSpec } from './spec.js'
import { buildTemplateContext } from './template.js'

const here = dirname(fileURLToPath(import.meta.url))
/** Resolved at runtime: the engine reads layers from `dist/layers` (production) or `layers` (dev). */
const LAYERS_DIR = pickLayersDir()

function pickLayersDir(): string {
  // tsdown builds to `dist/`; layer source lives at `<pkg>/layers`, but `build-layers.ts`
  // mirrors them into `<pkg>/dist/layers/` with workspace versions resolved + JS variants
  // generated. Prefer the built tree if present (production); fall back to source (dev/tests).
  const built = join(here, 'layers')
  if (existsSync(built)) return built
  return join(here, '..', 'layers')
}

export interface ComposeOptions {
  /** Override layer source dir (test hook). Defaults to the engine's resolved `dist/layers/`. */
  layersDir?: string
  /** Receives non-fatal warnings (e.g. dep collisions). */
  warn?: (msg: string) => void
}

export interface ComposeResult {
  /** Layers actually applied, in order. */
  applied: LayerRef[]
  /** Files written count (best-effort). */
  files: number
}

export async function composeProject(
  spec: ProjectSpec,
  targetDir: string,
  opts: ComposeOptions = {},
): Promise<ComposeResult> {
  const errors = validateSpec(spec)
  if (errors.length > 0) {
    throw new Error(
      'Invalid project spec:\n' + errors.map((e) => `  • [${e.field}] ${e.message}`).join('\n'),
    )
  }

  const layersRoot = opts.layersDir ?? LAYERS_DIR
  const refs = resolveLayers(spec).sort((a, b) => a.slot - b.slot)
  const manifests: Array<{ ref: LayerRef; manifest: LayerManifest; path: string }> = []
  for (const ref of refs) {
    const path = join(layersRoot, ref.id)
    if (!existsSync(path)) {
      throw new Error(`Missing layer: ${ref.id} (looked at ${path})`)
    }
    const manifestPath = join(path, '_layer.json')
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(await fs.readFile(manifestPath, 'utf8')) as LayerManifest)
      : {}
    manifests.push({ ref, manifest, path })
  }

  await fs.mkdir(targetDir, { recursive: true })

  const templateContext = buildTemplateContext(spec)

  let totalFiles = 0
  for (const { manifest, path } of manifests) {
    const filesDir = manifest.filesDir ?? 'files'
    const filesVariantDir =
      spec.variant === 'ts'
        ? (manifest.filesTsDir ?? 'files-ts')
        : (manifest.filesJsDir ?? 'files-js')
    const rootDir = manifest.rootDir ? join(targetDir, manifest.rootDir) : targetDir

    const generic = join(path, filesDir)
    if (existsSync(generic)) {
      const r = await copyTree(generic, rootDir, { templateContext })
      totalFiles += r.files
    }
    const variantSpecific = join(path, filesVariantDir)
    if (existsSync(variantSpecific)) {
      const r = await copyTree(variantSpecific, rootDir, { templateContext })
      totalFiles += r.files
    }
  }

  const viteFragments: ViteConfigFragment[] = []
  const astroFragments: AstroConfigFragment[] = []
  const seamFragments: SeamConfigFragment[] = []
  const angularFragments: AngularConfigFragment[] = []
  for (const { manifest } of manifests) {
    if (manifest.viteConfig) viteFragments.push(manifest.viteConfig)
    if (manifest.astroConfig) astroFragments.push(manifest.astroConfig)
    if (manifest.seamConfig) seamFragments.push(manifest.seamConfig)
    if (manifest.angularConfig) angularFragments.push(manifest.angularConfig)
  }

  if (spec.host === 'vite') {
    const rendered = renderViteConfig(viteFragments, spec.variant)
    await fs.writeFile(join(targetDir, rendered.filename), rendered.source, 'utf8')
  } else if (spec.host === 'astro') {
    const rendered = renderAstroConfig(astroFragments)
    await fs.writeFile(join(targetDir, rendered.filename), rendered.source, 'utf8')
  } else if (spec.host === 'angular') {
    await writeAngularJson(targetDir, angularFragments)
  }

  const seam = renderSeamConfig(seamFragments, spec.variant)
  await fs.writeFile(join(targetDir, seam.filename), seam.source, 'utf8')

  if (spec.variant === 'ts') {
    const tsconfigs = renderTsconfig(spec.host, spec.addons)
    for (const tc of tsconfigs) {
      const dest = join(targetDir, tc.filename)
      await fs.mkdir(dirname(dest), { recursive: true })
      await fs.writeFile(dest, tc.source, 'utf8')
    }
  }

  const pkgPath = join(targetDir, 'package.json')
  const { onlyBuiltDependencies } = await mergeIntoPackageJson(
    pkgPath,
    [
      // Seed name first so it lands in the canonical position; the final
      // entry below re-pins it so a layer can't accidentally override it.
      { pkgOverrides: { name: spec.name }, origin: 'spec' },
      ...manifests.map(({ manifest, ref }) => ({
        deps: manifest.deps,
        devDeps: manifest.devDeps,
        peerDeps: manifest.peerDeps,
        onlyBuiltDeps: manifest.onlyBuiltDeps,
        scripts: manifest.scripts,
        pkgOverrides: manifest.pkgOverrides,
        origin: ref.id,
      })),
      { pkgOverrides: { name: spec.name, private: undefined }, origin: 'spec' },
    ],
    { warn: opts.warn },
  )

  if (onlyBuiltDependencies.length) {
    await writePnpmWorkspaceYaml(targetDir, onlyBuiltDependencies)
  }

  await ensureGitignore(targetDir)

  return { applied: refs, files: totalFiles }
}

async function ensureGitignore(dir: string): Promise<void> {
  const file = join(dir, '.gitignore')
  if (existsSync(file)) return
  await fs.writeFile(file, ['node_modules', 'dist', '.DS_Store', ''].join('\n'), 'utf8')
}

/**
 * pnpm (v10+) reads its build-script allowlist from `pnpm-workspace.yaml`, not
 * from `package.json`'s `pnpm` field — even for a single-package project. Without
 * this, tools like esbuild/vite that ship a postinstall script get their build
 * silently blocked and `pnpm install` exits non-zero. The config key itself moved
 * again between pnpm 10 (`onlyBuiltDependencies`, an array) and pnpm 11
 * (`allowBuilds`, a map) — write both so either version is satisfied.
 */
async function writePnpmWorkspaceYaml(dir: string, onlyBuiltDependencies: string[]): Promise<void> {
  const file = join(dir, 'pnpm-workspace.yaml')
  const lines = [
    'onlyBuiltDependencies:',
    ...onlyBuiltDependencies.map((name) => `  - ${name}`),
    'allowBuilds:',
    ...onlyBuiltDependencies.map((name) => `  ${name}: true`),
    '',
  ]
  await fs.writeFile(file, lines.join('\n'), 'utf8')
}
