import { execa, type ResultPromise } from 'execa'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = resolve(HERE, '..', '..', '..')
const TEMPLATES = resolve(REPO_ROOT, 'packages', 'create-seam', 'templates')
export const EXAMPLE_DIR = resolve(TEMPLATES, 'vite-hono-ts')
export const EXAMPLE_DIR_EXPRESS = resolve(TEMPLATES, 'vite-express-ts')
export const EXAMPLE_DIR_FASTIFY = resolve(TEMPLATES, 'vite-fastify-ts')
export const EXAMPLE_DIR_NESTJS = resolve(TEMPLATES, 'vite-nestjs')
export const EXAMPLE_DIR_ELYSIA = resolve(TEMPLATES, 'vite-elysia-ts')
export const EXAMPLE_DIR_ASTRO = resolve(TEMPLATES, 'astro-hono-ts')
export const EXAMPLE_DIR_ANGULAR_HONO = resolve(TEMPLATES, 'angular-hono')
export const EXAMPLE_DIR_ANGULAR_NESTJS = resolve(TEMPLATES, 'angular-nestjs')
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
