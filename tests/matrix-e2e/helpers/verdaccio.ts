import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import getPort, { portNumbers } from 'get-port'
import { execa } from 'execa'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export interface VerdaccioInstance {
  url: string
  port: number
  storageDir: string
  configDir: string
  shutdown(): Promise<void>
}

function configYaml(storageDir: string, htpasswdPath: string, port: number): string {
  return [
    `storage: ${storageDir}`,
    `auth:`,
    `  htpasswd:`,
    `    file: ${htpasswdPath}`,
    `    max_users: 1000`,
    `listen:`,
    `  - 0.0.0.0:${port}`,
    `uplinks:`,
    `  npmjs:`,
    `    url: https://registry.npmjs.org/`,
    `    cache: true`,
    `packages:`,
    `  '@seamstack/*':`,
    `    access: $all`,
    `    publish: $all`,
    `    unpublish: $all`,
    `  'create-seam':`,
    `    access: $all`,
    `    publish: $all`,
    `    unpublish: $all`,
    `  '@*/*':`,
    `    access: $all`,
    `    publish: $authenticated`,
    `    proxy: npmjs`,
    `  '**':`,
    `    access: $all`,
    `    publish: $authenticated`,
    `    proxy: npmjs`,
    `log:`,
    `  type: stdout`,
    `  format: pretty`,
    `  level: warn`,
    ``,
  ].join('\n')
}

async function waitForRegistry(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/-/ping`)
      if (res.ok) return
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Verdaccio at ${url} did not become ready within ${timeoutMs}ms`)
}

export async function startVerdaccio(): Promise<VerdaccioInstance> {
  const port = await getPort({ port: portNumbers(4_873, 4_999) })
  const root = mkdtempSync(join(tmpdir(), 'seamstack-matrix-verdaccio-'))
  const storageDir = join(root, 'storage')
  const configDir = join(root, 'config')
  mkdirSync(storageDir, { recursive: true })
  mkdirSync(configDir, { recursive: true })
  const htpasswdPath = join(configDir, 'htpasswd')
  writeFileSync(htpasswdPath, '', 'utf8')
  const configPath = join(configDir, 'config.yaml')
  writeFileSync(configPath, configYaml(storageDir, htpasswdPath, port), 'utf8')

  const verdaccioBin = require.resolve('verdaccio/build/lib/cli.js')
  const proc = execa('node', [verdaccioBin, '--config', configPath], {
    reject: false,
    detached: true,
    stdio: 'pipe',
    env: { ...process.env },
  })
  proc.catch(() => { /* swallow */ })

  const url = `http://127.0.0.1:${port}`
  try {
    await waitForRegistry(url, 30_000)
  } catch (e) {
    proc.kill('SIGTERM')
    throw e
  }

  // Register an anonymous-ish user so npm publish has a token. Verdaccio will
  // create the account in the htpasswd file because max_users: -1 (any).
  const tokenRes = await fetch(`${url}/-/user/org.couchdb.user:matrixbot`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'matrixbot', password: 'matrixbot', email: 'matrixbot@example.com' }),
  })
  if (!tokenRes.ok) {
    proc.kill('SIGTERM')
    throw new Error(`Failed to create verdaccio user (status ${tokenRes.status})`)
  }
  const tokenJson = (await tokenRes.json()) as { token?: string }
  if (!tokenJson.token) {
    proc.kill('SIGTERM')
    throw new Error('Verdaccio user-create did not return a token')
  }
  // Stash for global access by publish.ts and scaffold.ts.
  process.env.MATRIX_REGISTRY = url
  process.env.MATRIX_REGISTRY_TOKEN = tokenJson.token

  return {
    url,
    port,
    storageDir,
    configDir,
    async shutdown() {
      proc.kill('SIGTERM')
      const force = setTimeout(() => proc.kill('SIGKILL'), 4000)
      try { await proc } catch { /* expected */ } finally { clearTimeout(force) }
    },
  }
}
