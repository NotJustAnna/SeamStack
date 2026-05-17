import { loadConfig } from '../config.js'
import { resolveWeave } from '../resolver.js'
import { formatPlan, type Phase } from '../plan-format.js'

export interface PlanOptions {
  readonly cwd: string
  readonly config?: string
  readonly phase?: string
  readonly json?: boolean
  readonly host?: string
  readonly port?: number
  readonly frontendPort?: number
  readonly backendPort?: number
}

const PHASES: readonly Phase[] = ['dev', 'build', 'start']

function asPhase(s: string | undefined): Phase | undefined {
  if (s && (PHASES as readonly string[]).includes(s)) return s as Phase
  return undefined
}

export async function runPlan(opts: PlanOptions): Promise<void> {
  const { config } = await loadConfig(opts.cwd, opts.config)
  const phase = asPhase(opts.phase)
  // Use 'dev' mode for resolution when explaining dev specifically; otherwise 'prod'
  const mode = phase === 'dev' ? 'dev' : 'prod'
  const topology = await resolveWeave({
    weave: config,
    mode,
    host: opts.host,
    port: opts.port,
    frontendPort: opts.frontendPort,
    backendPort: opts.backendPort,
  })

  if (opts.json) {
    const out = {
      mode: topology.mode,
      publicHost: topology.publicHost,
      publicPort: topology.publicPort,
      publicUrl: topology.publicUrl,
      services: topology.services.map((s) => ({
        framework: s.framework,
        role: s.role,
        mountPath: s.mountPath,
        devPort: s.devPort,
        prodPort: s.prodPort,
      })),
      routing: topology.routing,
    }
    console.log(JSON.stringify(out, null, 2))
    return
  }

  console.log(formatPlan(topology, phase))
}
