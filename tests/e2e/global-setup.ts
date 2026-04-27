import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execa } from 'execa'
import { composeProject, type ProjectSpec } from 'create-seam'
import { startVerdaccio, type VerdaccioInstance } from '../matrix-e2e/helpers/verdaccio.js'
import { publishWorkspace } from '../matrix-e2e/helpers/publish.js'

interface ComboDef {
  envKey: string
  spec: ProjectSpec
  // Each *.test.ts file has a hardcoded PORT — keep these in sync with the
  // corresponding test file. global-setup rewrites the scaffolded
  // seam.config.ts to use this port so the test's `waitForPort` matches.
  port: number
}

const COMBOS: ComboDef[] = [
  { envKey: 'E2E_DIR_VITE_HONO_TS', port: 4567, spec: { name: 'app', host: 'vite', ui: 'react', variant: 'ts', backend: 'hono', addons: [] } },
  { envKey: 'E2E_DIR_VITE_EXPRESS_TS', port: 4570, spec: { name: 'app', host: 'vite', ui: 'react', variant: 'ts', backend: 'express', addons: [] } },
  { envKey: 'E2E_DIR_VITE_FASTIFY_TS', port: 4571, spec: { name: 'app', host: 'vite', ui: 'react', variant: 'ts', backend: 'fastify', addons: [] } },
  { envKey: 'E2E_DIR_VITE_NESTJS', port: 4572, spec: { name: 'app', host: 'vite', ui: 'react', variant: 'ts', backend: 'nestjs', addons: [] } },
  { envKey: 'E2E_DIR_VITE_ELYSIA_TS', port: 4573, spec: { name: 'app', host: 'vite', ui: 'react', variant: 'ts', backend: 'elysia', addons: [] } },
  { envKey: 'E2E_DIR_ASTRO_HONO_TS', port: 4574, spec: { name: 'app', host: 'astro', ui: null, variant: 'ts', backend: 'hono', addons: [] } },
  { envKey: 'E2E_DIR_ANGULAR_HONO', port: 4573, spec: { name: 'app', host: 'angular', ui: null, variant: 'ts', backend: 'hono', addons: [] } },
  { envKey: 'E2E_DIR_ANGULAR_NESTJS', port: 4574, spec: { name: 'app', host: 'angular', ui: null, variant: 'ts', backend: 'nestjs', addons: [] } },
]

async function rewriteSeamConfigPort(tmpDir: string, port: number): Promise<void> {
  const path = join(tmpDir, 'seam.config.ts')
  let src: string
  try {
    src = await readFile(path, 'utf8')
  } catch {
    return
  }
  const next = src.replace(/port:\s*\d+/, `port: ${port}`)
  if (next !== src) await writeFile(path, next, 'utf8')
}

async function rewriteSeamPackages(pkgPath: string, matrixVersion: string): Promise<void> {
  const raw = await readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const deps = pkg[field]
    if (!deps) continue
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@seamstack/') || name === 'create-seam') {
        deps[name] = matrixVersion
      }
    }
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

async function writeNpmrc(tmpDir: string, registryUrl: string, token: string): Promise<void> {
  const registryHost = registryUrl.replace(/^https?:/, '')
  const lines = [
    `registry=${registryUrl}`,
    `${registryHost}/:_authToken=${token}`,
    `audit=false`,
    `fund=false`,
    ``,
  ]
  await writeFile(join(tmpDir, '.npmrc'), lines.join('\n'), 'utf8')
}

async function scaffoldOne(combo: ComboDef, registryUrl: string, matrixVersion: string, token: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), `seamstack-e2e-${combo.envKey.toLowerCase()}-`))
  await composeProject(combo.spec, tmpDir, { warn: () => undefined })
  await rewriteSeamConfigPort(tmpDir, combo.port)
  await rewriteSeamPackages(join(tmpDir, 'package.json'), matrixVersion)
  await writeNpmrc(tmpDir, registryUrl, token)

  const install = await execa(
    'npm',
    ['install', '--no-audit', '--no-fund', '--prefer-online', '--legacy-peer-deps', '--registry', registryUrl],
    { cwd: tmpDir, reject: false, all: true, env: { ...process.env, npm_config_registry: registryUrl } },
  )
  if (install.exitCode !== 0) {
    throw new Error(`[e2e] npm install failed for ${combo.envKey}:\n${(install.all ?? '').slice(-2000)}`)
  }
  return tmpDir
}

let verdaccio: VerdaccioInstance | undefined
const tmpDirs: string[] = []

export default async function setup(): Promise<() => Promise<void>> {
  if (process.env.E2E !== '1') {
    process.stdout.write('\n[e2e] gated off (set E2E=1 to run)\n')
    return async () => undefined
  }

  const t0 = Date.now()
  verdaccio = await startVerdaccio()
  const token = process.env.MATRIX_REGISTRY_TOKEN
  if (!token) throw new Error('[e2e] MATRIX_REGISTRY_TOKEN missing after verdaccio start')

  const published = await publishWorkspace(verdaccio.url, token)
  process.stdout.write(
    `[e2e] verdaccio at ${verdaccio.url} — published ${published.packages.length} packages as ${published.matrixVersion}\n`,
  )

  // Install sequentially: parallel `npm install` of the same packages (esbuild
  // in particular) into sibling tmpDirs races on its postinstall binary check
  // and fails with ETXTBSY. Sequential is slow (~5-6 min total) but reliable.
  for (const combo of COMBOS) {
    const dir = await scaffoldOne(combo, verdaccio.url, published.matrixVersion, token)
    process.env[combo.envKey] = dir
    tmpDirs.push(dir)
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  process.stdout.write(`[e2e] scaffolded ${COMBOS.length} fixtures in ${elapsed}s\n`)

  return async () => {
    for (const d of tmpDirs) {
      try { await rm(d, { recursive: true, force: true }) } catch { /* best effort */ }
    }
    if (verdaccio) {
      await verdaccio.shutdown()
      verdaccio = undefined
    }
  }
}
