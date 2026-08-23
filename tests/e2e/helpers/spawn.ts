import { execa, type ResultPromise } from 'execa'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = resolve(HERE, '..', '..', '..')

function envDir(key: string): string {
  const v = process.env[key]
  if (!v) {
    throw new Error(
      `${key} not set — globalSetup did not run. Run with E2E=1 (e.g. \`E2E=1 pnpm test\`).`,
    )
  }
  return v
}

// Each fixture is a real create-seam scaffold (with `npm install` against a
// per-run verdaccio) created by tests/e2e/global-setup.ts. The setup writes
// each path into a fixed env var so these constants resolve at module load
// without needing every test to call `inject()`.
export const EXAMPLE_DIR = envDir('E2E_DIR_VITE_HONO_TS')
export const EXAMPLE_DIR_EXPRESS = envDir('E2E_DIR_VITE_EXPRESS_TS')
export const EXAMPLE_DIR_FASTIFY = envDir('E2E_DIR_VITE_FASTIFY_TS')
export const EXAMPLE_DIR_NESTJS = envDir('E2E_DIR_VITE_NESTJS')
export const EXAMPLE_DIR_ELYSIA = envDir('E2E_DIR_VITE_ELYSIA_TS')
export const EXAMPLE_DIR_ASTRO = envDir('E2E_DIR_ASTRO_HONO_TS')
export const EXAMPLE_DIR_ANGULAR_HONO = envDir('E2E_DIR_ANGULAR_HONO')
export const EXAMPLE_DIR_ANGULAR_NESTJS = envDir('E2E_DIR_ANGULAR_NESTJS')
export const EXAMPLE_DIR_ELYSIA_BUN = envDir('E2E_DIR_VITE_ELYSIA_BUN')
export const EXAMPLE_DIR_ELYSIA_DENO = envDir('E2E_DIR_VITE_ELYSIA_DENO')
export const SEAM_BIN = resolve(REPO_ROOT, 'packages', 'cli', 'dist', 'bin.js')

export interface SpawnOptions {
  readonly cwd: string
  readonly env?: Record<string, string>
}

export interface SeamProcess {
  readonly proc: ResultPromise<{ reject: false }>
  kill(): Promise<void>
}

function signalTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (typeof pid !== 'number') return
  if (process.platform === 'win32') {
    try { process.kill(pid, signal) } catch { /* gone */ }
    return
  }
  try { process.kill(-pid, signal) }
  catch {
    try { process.kill(pid, signal) } catch { /* gone */ }
  }
}

export function spawnSeam(args: string[], opts: SpawnOptions): SeamProcess {
  const env: Record<string, string> = { ...process.env as Record<string, string>, ...(opts.env ?? {}) }
  const proc = execa('node', [SEAM_BIN, ...args], {
    cwd: opts.cwd,
    env,
    reject: false,
    all: true,
    detached: true,
  })
  proc.catch(() => {
    /* swallow — caller decides what to do with exit */
  })
  return {
    proc,
    async kill() {
      if (proc.killed) return
      signalTree(proc.pid, 'SIGTERM')
      const force = setTimeout(() => signalTree(proc.pid, 'SIGKILL'), 4000)
      try {
        await proc
      } catch {
        /* expected */
      } finally {
        clearTimeout(force)
      }
    },
  }
}

export async function runSeam(
  args: string[],
  opts: SpawnOptions,
): Promise<{ exitCode: number; stdout: string; stderr: string; all: string }> {
  const env: Record<string, string> = { ...process.env as Record<string, string>, ...(opts.env ?? {}) }
  const result = await execa('node', [SEAM_BIN, ...args], {
    cwd: opts.cwd,
    env,
    reject: false,
    all: true,
  })
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    all: result.all ?? '',
  }
}
