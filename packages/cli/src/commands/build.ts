import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { loadConfig } from '../config.js'
import { resolveWeave } from '../resolver.js'
import { log } from '../logger.js'
import type {
  BuildContext,
  BuildOutput,
  WatchHandle,
  PluginBuildContext,
} from '@seamstack/core'

export interface BuildOptions {
  readonly cwd: string
  readonly config?: string
  readonly host?: string
  readonly port?: number
  readonly frontendPort?: number
  readonly backendPort?: number
  readonly watch?: boolean
}

export async function runBuild(opts: BuildOptions): Promise<void> {
  const totalStart = Date.now()
  const { config, configPath } = await loadConfig(opts.cwd, opts.config)
  const projectRoot = dirname(configPath)
  const topology = await resolveWeave({
    weave: config,
    mode: 'prod',
    host: opts.host,
    port: opts.port,
    frontendPort: opts.frontendPort,
    backendPort: opts.backendPort,
  })

  const outDir = resolve(projectRoot, 'dist')
  await mkdir(outDir, { recursive: true })

  log.info('building for production')
  log.debug(`outDir=${outDir}`)

  // Asset sources first, then hosts (which read peer outputs to write _seam_prod.js)
  const order = [...topology.services].sort((a, b) =>
    a.role === 'asset-source' ? -1 : 1,
  )

  const peerOutputs: Record<string, BuildOutput> = {}

  for (const service of order) {
    const ctx: BuildContext = {
      mode: 'prod',
      cwd: projectRoot,
      publicHost: topology.publicHost,
      publicPort: topology.publicPort,
      publicUrl: topology.publicUrl,
      outDir,
      peerOutputs: { ...peerOutputs },
    }
    const start = Date.now()
    log.info(`building ${service.framework}…`)
    const out = await service.instance.build(ctx)
    peerOutputs[service.framework] = out
    log.success(`${service.framework} built in ${Date.now() - start}ms`)
  }

  // Plugins build last so codegen can read the built artifacts above.
  for (const plugin of topology.plugins) {
    if (!plugin.instance.build) continue
    const ctx: PluginBuildContext = {
      mode: 'prod',
      cwd: projectRoot,
      publicHost: topology.publicHost,
      publicPort: topology.publicPort,
      publicUrl: topology.publicUrl,
      outDir,
      peerOutputs: { ...peerOutputs },
    }
    const start = Date.now()
    log.info(`building plugin ${plugin.name}…`)
    await plugin.instance.build(ctx)
    log.success(`plugin ${plugin.name} built in ${Date.now() - start}ms`)
  }

  log.success(`build complete in ${Date.now() - totalStart}ms`)

  if (!opts.watch) return

  log.info('watching for changes…')

  const watchHandles: WatchHandle[] = []

  let stopping = false
  const cleanup = async () => {
    if (stopping) return
    stopping = true
    for (const h of watchHandles) {
      try {
        await h.stop()
      } catch {
        /* ignore */
      }
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void cleanup())
  process.on('SIGTERM', () => void cleanup())

  for (const service of order) {
    if (!service.instance.watch) continue
    const ctx: BuildContext = {
      mode: 'prod',
      cwd: projectRoot,
      publicHost: topology.publicHost,
      publicPort: topology.publicPort,
      publicUrl: topology.publicUrl,
      outDir,
      peerOutputs: { ...peerOutputs },
    }
    const handle = await service.instance.watch(ctx)
    watchHandles.push(handle)
  }

  await new Promise<void>(() => {})
}
