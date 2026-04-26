import type { ResolvedTopology } from '@seamstack/core'
import { pc } from './logger.js'

export type Phase = 'dev' | 'build' | 'start'

function formatRoutes(routes: readonly string[]): string {
  if (routes.length === 1) return routes[0]!
  return `[${routes.join(', ')}]`
}

export function formatPlan(topology: ResolvedTopology, phase?: Phase): string {
  const { publicHost, publicPort, services, plugins, mode } = topology
  const lines: string[] = []

  lines.push(`${pc.bold('Mode:')}        ${mode}`)
  lines.push(`${pc.bold('Public host:')} ${publicHost}`)
  lines.push(`${pc.bold('Public port:')} ${publicPort}`)
  lines.push(``)
  lines.push(pc.bold('Services:'))
  for (const s of services) {
    const dev =
      s.role === 'asset-source'
        ? `dev=${s.devPort} (public)`
        : `dev=${s.devPort} (internal)`
    const prod =
      s.role === 'asset-source' ? `prod=(no runtime)` : `prod=${s.prodPort} (public)`
    const routesLabel =
      s.routes.length > 1
        ? `routes=${formatRoutes(s.routes)}`
        : `mount=${s.mountPath.padEnd(8)}`
    lines.push(
      `  ${pc.cyan(s.framework.padEnd(8))} role=${s.role.padEnd(12)} ${routesLabel} ${dev}  ${prod}`,
    )
  }
  lines.push(``)

  if (plugins.length > 0) {
    lines.push(pc.bold('Plugins:'))
    for (const p of plugins) {
      const hooks: string[] = []
      if (p.instance.dev) hooks.push('dev')
      if (p.instance.build) hooks.push('build')
      if (p.instance.start) hooks.push('start')
      const hooksLabel = hooks.length > 0 ? `hooks=[${hooks.join(',')}]` : 'hooks=[]'
      const routesLabel = p.routes.length > 0 ? ` routes=${formatRoutes(p.routes)}` : ''
      lines.push(`  ${pc.magenta(p.name)}  ${hooksLabel}${routesLabel}`)
    }
    lines.push(``)
  }

  const source = services.find((s) => s.role === 'asset-source')!
  const host = services.find((s) => s.role === 'asset-host')!
  const publicUrl = `http://${publicHost}:${publicPort}`

  if (!phase || phase === 'dev') {
    lines.push(pc.bold('DEV'))
    lines.push(
      `  ${pc.cyan(publicUrl)}  →  ${source.framework} (listens on ${source.devPort})`,
    )
    for (let i = 0; i < host.routes.length; i++) {
      const corner = i === host.routes.length - 1 ? '└─' : '├─'
      lines.push(
        `                            ${corner} proxies ${host.routes[i]}/* → http://127.0.0.1:${host.devPort}`,
      )
    }
    lines.push(
      `  ${host.framework} runs via tsx (mode=dev, port=${host.devPort})`,
    )
    lines.push(``)
  }

  if (!phase || phase === 'build') {
    lines.push(pc.bold('BUILD'))
    lines.push(`  ${source.framework} build → ./dist/client/`)
    lines.push(`  write       ./dist/_seam_prod.js  { assetsDir, indexHtml }`)
    lines.push(`  ${host.framework} entry untouched`)
    lines.push(``)
  }

  if (!phase || phase === 'start') {
    lines.push(pc.bold('START'))
    lines.push(
      `  ${pc.cyan(publicUrl)}  →  ${host.framework} (tsx, cwd=./dist, mode=prod, port=${publicPort})`,
    )
    for (const route of host.routes) {
      lines.push(`                            ├─ ${route}/* → user routes`)
    }
    lines.push(
      `                            └─ /*       → ./dist/client + SPA fallback (via seam middleware reading _seam_prod.js)`,
    )
    lines.push(``)
  }

  return lines.join('\n')
}
