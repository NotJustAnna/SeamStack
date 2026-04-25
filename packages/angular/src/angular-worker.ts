import { promises as fs } from 'node:fs'
import { parentPort, workerData } from 'node:worker_threads'

interface WorkerData {
  readonly workspaceRoot: string
  readonly project: string
  readonly host: string
  readonly port: number
  readonly proxyConfig: string | null
  readonly wireEnvKey: string
  readonly wireEnv: string
}

interface ParentMessage {
  readonly type: 'stop'
}

const data = workerData as WorkerData
process.env[data.wireEnvKey] = data.wireEnv

// Worker stdio isn't a TTY, so color libs auto-disable. Force colors so Vite's
// banner reaches us with SGR codes — wrapStream() preserves them inline and the
// parent's TTY renders them.
if (!process.env['NO_COLOR'] && !process.env['FORCE_COLOR']) {
  process.env['FORCE_COLOR'] = '1'
}

let architectMod: typeof import('@angular-devkit/architect')
let architectNodeMod: typeof import('@angular-devkit/architect/node')
let coreMod: typeof import('@angular-devkit/core')
try {
  architectMod = await import('@angular-devkit/architect')
  architectNodeMod = await import(
    /* @vite-ignore */ '@angular-devkit/architect/node/index.js'
  )
  coreMod = await import('@angular-devkit/core')
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  parentPort?.postMessage({
    type: 'error',
    message:
      '[@seamstack/angular] missing Angular toolkit. Install `@angular-devkit/architect` and `@angular-devkit/core` (e.g. via `@angular/cli` as a devDependency).\n' +
      `Underlying error: ${message}`,
  })
  process.exit(1)
}

const { Architect } = architectMod
const { WorkspaceNodeModulesArchitectHost } = architectNodeMod
const { json, logging, workspaces } = coreMod

const workspaceHost: import('@angular-devkit/core').workspaces.WorkspaceHost = {
  readFile: (p) => fs.readFile(p, 'utf-8'),
  writeFile: (p, contents) => fs.writeFile(p, contents),
  async isDirectory(p) {
    try {
      const stats = await fs.stat(p)
      return stats.isDirectory()
    } catch {
      return false
    }
  },
  async isFile(p) {
    try {
      const stats = await fs.stat(p)
      return stats.isFile()
    } catch {
      return false
    }
  },
}

const { workspace } = await workspaces.readWorkspace(
  data.workspaceRoot,
  workspaceHost,
  workspaces.WorkspaceFormat.JSON,
)

const architectHost = new WorkspaceNodeModulesArchitectHost(
  workspace,
  data.workspaceRoot,
)
const registry = new json.schema.CoreSchemaRegistry()
registry.addPostTransform(json.schema.transforms.addUndefinedDefaults)
const architect = new Architect(architectHost, registry)

const logger = new logging.Logger('seam-angular')
logger.subscribe((entry) => {
  process.stdout.write(`${entry.message}\n`)
})

const overrides: Record<string, unknown> = {
  host: data.host,
  port: data.port,
}
if (data.proxyConfig) overrides['proxyConfig'] = data.proxyConfig

const run = await architect.scheduleTarget(
  { project: data.project, target: 'serve' },
  overrides as never,
  { logger },
)

let readyPosted = false
const subscription = run.output.subscribe({
  next: () => {
    if (!readyPosted) {
      readyPosted = true
      parentPort?.postMessage({ type: 'ready' })
    }
  },
  error: (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    if (!readyPosted) {
      parentPort?.postMessage({ type: 'error', message })
      process.exit(1)
    } else {
      process.stderr.write(`${message}\n`)
    }
  },
})

parentPort?.on('message', async (msg: ParentMessage) => {
  if (msg.type === 'stop') {
    try {
      subscription.unsubscribe()
      await run.stop()
    } catch {
      /* best-effort */
    }
    parentPort?.postMessage({ type: 'stopped' })
    process.exit(0)
  }
})
