import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execa } from 'execa'
import getPort from 'get-port'
import { composeProject } from 'create-seam'
import type { MatrixSpec } from './enumerate.js'

export interface ScaffoldResult {
  comboId: string
  spec: MatrixSpec
  tmpDir: string
  port: number
  cleanup(): Promise<void>
  warnings: string[]
}

export interface ScaffoldEnv {
  registryUrl: string
  matrixVersion: string
  token: string
}

async function rewritePackageJsonForRegistry(
  pkgPath: string,
  matrixVersion: string,
): Promise<void> {
  const raw = await fs.readFile(pkgPath, 'utf8')
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
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

async function rewriteSeamConfigPort(tmpDir: string, port: number, variant: 'ts' | 'js'): Promise<void> {
  const filename = variant === 'ts' ? 'seam.config.ts' : 'seam.config.js'
  const path = join(tmpDir, filename)
  let src: string
  try {
    src = await fs.readFile(path, 'utf8')
  } catch {
    return
  }
  const next = src.replace(/port:\s*\d+/, `port: ${port}`)
  if (next !== src) await fs.writeFile(path, next, 'utf8')
}

async function writeNpmrc(tmpDir: string, env: ScaffoldEnv): Promise<void> {
  const registryHost = env.registryUrl.replace(/^https?:/, '')
  const lines = [
    // Only @seamstack/* needs to resolve against verdaccio — everything else
    // (react, vite, typescript, ...) should hit the real npm registry directly
    // instead of being proxied through verdaccio's single-threaded process.
    `@seamstack:registry=${env.registryUrl}`,
    `${registryHost}/:_authToken=${env.token}`,
    `audit=false`,
    `fund=false`,
    ``,
  ]
  await fs.writeFile(join(tmpDir, '.npmrc'), lines.join('\n'), 'utf8')
}

export async function scaffoldCombo(spec: MatrixSpec, env: ScaffoldEnv): Promise<ScaffoldResult> {
  const tmpDir = await fs.mkdtemp(join(tmpdir(), `seamstack-matrix-${spec.comboId}-`))
  const warnings: string[] = []
  await composeProject(spec, tmpDir, { warn: (m) => warnings.push(m) })

  const port = await getPort()
  await rewriteSeamConfigPort(tmpDir, port, spec.variant)
  await rewritePackageJsonForRegistry(join(tmpDir, 'package.json'), env.matrixVersion)
  await writeNpmrc(tmpDir, env)

  // --legacy-peer-deps: the @seamstack/nestjs adapter currently has a peer-dep
  // mismatch (@nestjs/serve-static@5 wants @nestjs/common@^11, the layer pins
  // ^10). That's a real bug worth fixing upstream, but it shouldn't block the
  // matrix from validating the runtime serving behavior of every other combo.
  // Drop the flag once the upstream conflict is resolved.
  // No --registry / npm_config_registry override here: that would force every
  // package (not just @seamstack/*) through verdaccio, which is exactly what
  // the scoped `@seamstack:registry` in .npmrc is meant to avoid. Third-party
  // deps resolve against the real npm registry per npm's normal defaults.
  const install = await execa(
    'npm',
    ['install', '--no-audit', '--no-fund', '--prefer-online', '--legacy-peer-deps'],
    { cwd: tmpDir, reject: false, all: true },
  )
  if (install.exitCode !== 0) {
    throw new Error(`npm install failed for ${spec.comboId}:\n${(install.all ?? '').slice(-4000)}`)
  }

  return {
    comboId: spec.comboId,
    spec,
    tmpDir,
    port,
    warnings,
    async cleanup() {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch { /* best effort */ }
    },
  }
}

export interface BuildResult {
  exitCode: number
  log: string
}

export async function runSeamBuild(tmpDir: string): Promise<BuildResult> {
  const { runSeam } = await import('./spawn-seam.js')
  const r = await runSeam(['build'], { cwd: tmpDir })
  return { exitCode: r.exitCode, log: r.all }
}
