import { dirname, resolve } from 'node:path'
import { loadConfig } from '../config.js'
import { resolveWeave } from '../resolver.js'
import { log } from '../logger.js'
import { mountUI, unmountUI } from '../ui/index.js'
import type {
  DevContext,
  DevHandle,
  PluginDevContext,
  PluginDevHandle,
} from '@seamstack/core'

export interface DevOptions {
  readonly cwd: string
  readonly host?: string
}

export async function runDev(opts: DevOptions): Promise<void> {
  const start = Date.now()
  const { config, configPath } = await loadConfig(opts.cwd)
  const projectRoot = dirname(configPath)
  const topology = await resolveWeave({
    weave: config,
    mode: 'dev',
    ...(opts.host ? { host: opts.host } : {}),
  })

  const outDir = resolve(projectRoot, 'dist')
  const assetSource = topology.services.find((s) => s.role === 'asset-source')

  const members = [...topology.services]
    .sort((a, b) => (a.role === 'asset-source' ? -1 : 1))
    .map((s) => s.framework)

  const store = mountUI({
    mode: 'dev',
    publicUrl: topology.publicUrl,
    members,
  })

  // Hosts first so they're listening when sources start proxying to them
  const order = [...topology.services].sort((a, b) =>
    a.role === 'asset-host' ? -1 : 1,
  )

  const handles: DevHandle[] = []
  const pluginHandles: PluginDevHandle[] = []

  let stopping = false
  const cleanup = async () => {
    if (stopping) return
    stopping = true
    store.setStopping()
    // Plugins stop first — they may depend on services still being up to
    // emit final messages, but their teardown shouldn't block service shutdown.
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
    for (const service of order) {
      const ctx: DevContext = {
        mode: 'dev',
        cwd: projectRoot,
        publicHost: topology.publicHost,
        publicPort: topology.publicPort,
        publicUrl: topology.publicUrl,
        assignedPort: service.devPort,
        peers: topology.services.filter((s) => s !== service),
        outDir,
      }
      const handle = await service.instance.dev(ctx)
      handles.push(handle)
    }
    // Plugins start after services so they observe live ports if needed.
    for (const plugin of topology.plugins) {
      if (!plugin.instance.dev) continue
      const ctx: PluginDevContext = {
        mode: 'dev',
        cwd: projectRoot,
        publicHost: topology.publicHost,
        publicPort: topology.publicPort,
        publicUrl: topology.publicUrl,
        peers: topology.services,
        outDir,
      }
      const handle = await plugin.instance.dev(ctx)
      pluginHandles.push(handle)
    }
  } catch (e) {
    await unmountUI()
    log.error((e as Error).message)
    process.exit(1)
  }

  store.setReady(assetSource?.framework ?? 'seam', Date.now() - start)

  // Keep the process alive until Ctrl+C
  await new Promise<void>(() => {})
}
