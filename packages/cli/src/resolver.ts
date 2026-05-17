import { createServer } from 'node:net'
import type {
  WeaveInput,
  ResolvedTopology,
  ResolvedService,
  ResolvedPlugin,
  Serveable,
  SeamPlugin,
  SeamMode,
  FabricItem,
} from '@seamstack/core'

function isServeable(item: FabricItem): item is Serveable {
  return item.kind === 'serveable'
}

function isPlugin(item: FabricItem): item is SeamPlugin {
  return item.kind === 'plugin'
}

function validateRouteList(
  source: string,
  routes: readonly unknown[],
): readonly string[] {
  for (const r of routes) {
    if (typeof r !== 'string' || !r.startsWith('/') || r === '/') {
      throw new Error(
        `[seam] ${source}: invalid route ${JSON.stringify(r)} — each entry must start with '/' and not equal '/'.`,
      )
    }
  }
  return routes as readonly string[]
}

async function getFreePort(): Promise<number> {
  return new Promise((resolveP, rejectP) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', rejectP)
    srv.listen(0, () => {
      const address = srv.address()
      if (address && typeof address === 'object') {
        const port = address.port
        srv.close(() => resolveP(port))
      } else {
        srv.close(() => rejectP(new Error('Could not get free port')))
      }
    })
  })
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE')
    })
    srv.once('listening', () => {
      srv.close(() => resolve(false))
    })
    srv.listen(port, '127.0.0.1')
  })
}

export interface ResolverInput {
  readonly weave: WeaveInput
  readonly mode: SeamMode
  readonly host?: string
  readonly port?: number
  readonly frontendPort?: number
  readonly backendPort?: number
  readonly frontendStrictPort?: boolean
  readonly backendStrictPort?: boolean
}

export async function resolveWeave(input: ResolverInput): Promise<ResolvedTopology> {
  const { weave, mode } = input
  const publicHost = input.host ?? weave.host ?? 'localhost'

  const fabric = [...weave.fabric]

  const services = fabric.filter(isServeable)
  const plugins = fabric.filter(isPlugin)

  // Validate plugins up front so a malformed entry fails before we touch services.
  for (const p of plugins) {
    if (typeof p.name !== 'string' || p.name.length === 0) {
      throw new Error(`[seam] plugin is missing a non-empty 'name' field.`)
    }
    if (p.routes) validateRouteList(`plugin '${p.name}'`, p.routes)
  }

  const sources = services.filter((s) => s.traits.producesAssets)
  const hosts = services.filter((s) => s.traits.canHostAssets)

  if (sources.length === 0 || hosts.length === 0) {
    const summary = services
      .map(
        (s) =>
          `${s.framework}(producesAssets=${s.traits.producesAssets}, canHostAssets=${s.traits.canHostAssets})`,
      )
      .join(', ')
    throw new Error(
      `[seam] defineWeave needs one asset-producing AND one asset-hosting Serveable. ` +
        `Got: [${summary}]. ` +
        `defineStitch (multi-entrypoint) will land in a future release.`,
    )
  }

  if (sources.length > 1 || hosts.length > 1) {
    throw new Error(
      `[seam] defineWeave can't disambiguate multiple asset producers (${sources.length}) or hosts (${hosts.length}). ` +
        `Use defineStitch (coming later) or reduce your fabric to one of each. ` +
        `Sources: [${sources.map((s) => s.framework).join(', ')}], hosts: [${hosts.map((s) => s.framework).join(', ')}].`,
    )
  }

  const source = sources[0]!
  const hostSvc = hosts[0]!

  const sourceMount = source.traits.defaultMountPath
  const hostBaseRoutes = hostSvc.routes ?? [hostSvc.traits.defaultMountPath]

  // Fold plugin-contributed routes into the host's route list, deduped.
  const seen = new Set<string>()
  const hostRoutes: string[] = []
  for (const r of hostBaseRoutes) {
    if (!seen.has(r)) {
      seen.add(r)
      hostRoutes.push(r)
    }
  }
  for (const p of plugins) {
    for (const r of p.routes ?? []) {
      if (!seen.has(r)) {
        seen.add(r)
        hostRoutes.push(r)
      }
    }
  }

  // Every host route must not collide with the source's mount.
  for (const r of hostRoutes) {
    if (r === sourceMount) {
      throw new Error(
        `[seam] mount path collision: host route ${r} matches ${source.framework}'s mount ${sourceMount}. ` +
          `defineStitch (coming later) will let you override mount paths.`,
      )
    }
  }

  if (hostRoutes.length === 0) {
    throw new Error(
      `[seam] host adapter '${hostSvc.framework}' resolved to zero routes. ` +
        `Pass a non-empty 'routes' option or rely on its defaultMountPath.`,
    )
  }

  const publicPort = input.port ?? weave.port ?? (Number(process.env['PORT']) || 3000)
  const sourceDevPort = input.frontendPort ?? publicPort
  const hostDevPort = input.backendPort ?? await getFreePort()
  const hostProdPort = input.backendPort ?? publicPort

  if (input.frontendStrictPort && await isPortInUse(sourceDevPort)) {
    throw new Error(`[seam] --frontend-strict-port: port ${sourceDevPort} is already in use.`)
  }
  if (input.backendStrictPort && await isPortInUse(hostDevPort)) {
    throw new Error(`[seam] --backend-strict-port: port ${hostDevPort} is already in use.`)
  }

  const resolvedSource: ResolvedService = {
    instance: source,
    framework: source.framework,
    role: 'asset-source',
    mountPath: sourceMount,
    routes: [sourceMount],
    devPort: sourceDevPort,
    prodPort: 0,
  }
  const resolvedHost: ResolvedService = {
    instance: hostSvc,
    framework: hostSvc.framework,
    role: 'asset-host',
    mountPath: hostRoutes[0]!,
    routes: hostRoutes,
    devPort: hostDevPort,
    prodPort: hostProdPort,
  }

  const routing: Record<string, string> = {
    [resolvedSource.mountPath]: resolvedSource.framework,
  }
  for (const r of hostRoutes) {
    routing[r] = resolvedHost.framework
  }

  const resolvedPlugins: ResolvedPlugin[] = plugins.map((p) => ({
    instance: p,
    name: p.name,
    routes: p.routes ?? [],
  }))

  const publicUrl = `http://${publicHost}:${publicPort}`

  return {
    publicHost,
    publicPort,
    publicUrl,
    services: [resolvedSource, resolvedHost],
    plugins: resolvedPlugins,
    routing,
    mode,
  }
}
