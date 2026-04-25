import { parentPort, workerData } from 'node:worker_threads'

interface WorkerData {
  readonly root: string
  readonly wireEnvKey: string
  readonly wireEnv: string
}

interface ParentMessage {
  readonly type: 'stop'
}

const data = workerData as WorkerData
process.env[data.wireEnvKey] = data.wireEnv

// Worker stdio isn't a TTY, so color libs (picocolors, kleur, etc.) auto-disable.
// Force colors so astro's banner reaches us with SGR codes — wrapStream() preserves
// them inline and the parent's TTY renders them.
if (!process.env['NO_COLOR'] && !process.env['FORCE_COLOR']) {
  process.env['FORCE_COLOR'] = '1'
}

const astroLib = await import('astro')
const server = await astroLib.dev({
  root: data.root,
  logLevel: 'info',
})

parentPort?.postMessage({ type: 'ready' })

parentPort?.on('message', async (msg: ParentMessage) => {
  if (msg.type === 'stop') {
    try {
      await server.stop()
    } catch {
      /* best-effort */
    }
    parentPort?.postMessage({ type: 'stopped' })
    process.exit(0)
  }
})
