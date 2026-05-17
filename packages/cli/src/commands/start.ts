import { dirname, resolve } from 'node:path'
import { loadConfig } from '../config.js'
import { resolveWeave } from '../resolver.js'
import { log } from '../logger.js'
import { mountUI, unmountUI } from '../ui/index.js'
import type {
  StartContext,
  StartHandle,
  PluginStartContext,
  PluginStartHandle,
} from '@seamstack/core'

export interface StartOptions {
  readonly cwd: string
  readonly config?: string
  readonly host?: string
  readonly port?: number
  readonly frontendPort?: number
  readonly backendPort?: number
  readonly frontendStrictPort?: boolean
  readonly backendStrictPort?: boolean
}

export async function runStart(opts: StartOptions): Promise<void> {
  const start = Date.now()
  const { config, configPath } = await loadConfig(opts.cwd, opts.config)
  const projectRoot = dirname(configPath)
  const topology = await resolveWeave({
    weave: config,
    mode: 'prod',
    host: opts.host,
    port: opts.port,
    frontendPort: opts.frontendPort,
    backendPort: opts.backendPort,
    frontendStrictPort: opts.frontendStrictPort,
    backendStrictPort: opts.backendStrictPort,
  })

  const outDir = resolve(projectRoot, 'dist')

  const members = [...topology.services]
    .sort((a, b) => (a.role === 'asset-source' ? -1 : 1))
    .map((s) => s.framework)

  const store = mountUI({
    mode: 'start',
    publicUrl: topology.publicUrl,
    members,
  })

  const handles: StartHandle[] = []
  const pluginHandles: PluginStartHandle[] = []

  let stopping = false
  const cleanup = async () => {
    if (stopping) return
    stopping = true
    store.setStopping()
    for (const h of pluginHandles) {
      try {
        await h.stop()
      } catch {
        /* ignore */
      }
    }
    for (const h of handles) {
      try {
        await h.stop()
      } catch {
        /* ignore */
      }
    }
    await unmountUI()
    process.exit(0)
  }
  process.on('SIGINT', () => void cleanup())
  process.on('SIGTERM', () => void cleanup())

  try {
    for (const service of topology.services) {
      const ctx: StartContext = {
        mode: 'prod',
        cwd: projectRoot,
        publicHost: topology.publicHost,
        publicPort: topology.publicPort,
        publicUrl: topology.publicUrl,
        assignedPort: service.role === 'asset-host' ? service.prodPort : 0,
        outDir,
        peers: topology.services.filter((s) => s !== service),
      }
      const handle = await service.instance.start(ctx)
      handles.push(handle)
    }
    for (const plugin of topology.plugins) {
      if (!plugin.instance.start) continue
      const ctx: PluginStartContext = {
        mode: 'prod',
        cwd: projectRoot,
        publicHost: topology.publicHost,
        publicPort: topology.publicPort,
        publicUrl: topology.publicUrl,
        peers: topology.services,
        outDir,
      }
      const handle = await plugin.instance.start(ctx)
      pluginHandles.push(handle)
    }
  } catch (e) {
    await unmountUI()
    log.error((e as Error).message)
    process.exit(1)
  }

  store.setReady(topology.publicUrl, Date.now() - start)

  await new Promise<void>(() => {})
}
