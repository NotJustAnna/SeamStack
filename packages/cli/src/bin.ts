#!/usr/bin/env node
import { cac } from 'cac'
import { runDev } from './commands/dev.js'
import { runBuild } from './commands/build.js'
import { runStart } from './commands/start.js'
import { runPlan } from './commands/plan.js'
import { log, setLogLevel } from './logger.js'

interface GlobalOptions {
  verbose?: boolean
  config?: string
  host?: string | boolean
  port?: number
  debug?: string | boolean
}

interface PortOptions {
  frontendPort?: number
  backendPort?: number
}

interface StrictPortOptions {
  frontendStrictPort?: boolean
  backendStrictPort?: boolean
}

function resolveHost(h: string | boolean | undefined): string | undefined {
  if (h === true) return '0.0.0.0'
  return h || undefined
}

function configureGlobals(opts: GlobalOptions): void {
  if (opts.debug !== undefined) {
    process.env.DEBUG = opts.debug === true ? '*' : (opts.debug as string)
  }
  setLogLevel(opts.verbose ? 'verbose' : 'normal')
}

const cli = cac('seam')

cli
  .option('-c, --config <file>', 'Use specified config file')
  .option('--debug [namespace]', 'Enable debug output (optionally scoped, e.g. vite:resolve)')
  .option('--port <port>', 'Fullstack port (public URL port, default: 3000)')

cli
  .command('dev', 'Start the dev composition')
  .option('-v, --verbose', 'Show internal seam details (port assignments, spawn args)')
  .option('--host [host]', 'Bind host (default: 0.0.0.0 when flag is bare)')
  .option('--frontend-port <port>', 'Override the frontend (asset-source) dev port')
  .option('--backend-port <port>', 'Override the backend (asset-host) internal dev port')
  .option('--frontend-strict-port', 'Fail if the frontend port is already in use')
  .option('--backend-strict-port', 'Fail if the backend port is already in use')
  .action(async (options: GlobalOptions & PortOptions & StrictPortOptions) => {
    configureGlobals(options)
    try {
      await runDev({
        cwd: process.cwd(),
        config: options.config,
        host: resolveHost(options.host),
        port: options.port,
        frontendPort: options.frontendPort,
        backendPort: options.backendPort,
        frontendStrictPort: options.frontendStrictPort,
        backendStrictPort: options.backendStrictPort,
      })
    } catch (e) {
      log.error((e as Error).message)
      process.exit(1)
    }
  })

cli
  .command('build', 'Build the composition for production')
  .option('-v, --verbose', 'Show internal seam details')
  .option('-w, --watch', 'Rebuild on source changes after the initial build')
  .option('--host [host]', 'Public host to embed in the resolved topology (default: 0.0.0.0 when flag is bare)')
  .option('--frontend-port <port>', 'Override the frontend port baked into the topology')
  .option('--backend-port <port>', 'Override the backend port baked into the topology')
  .action(async (options: GlobalOptions & PortOptions & { watch?: boolean }) => {
    configureGlobals(options)
    try {
      await runBuild({
        cwd: process.cwd(),
        config: options.config,
        host: resolveHost(options.host),
        port: options.port,
        frontendPort: options.frontendPort,
        backendPort: options.backendPort,
        watch: options.watch,
      })
    } catch (e) {
      log.error((e as Error).message)
      process.exit(1)
    }
  })

cli
  .command('start', 'Run the production composition')
  .option('-v, --verbose', 'Show internal seam details')
  .option('--host [host]', 'Bind host (default: 0.0.0.0 when flag is bare)')
  .option('--frontend-port <port>', 'Override the frontend (asset-source) port')
  .option('--backend-port <port>', 'Override the backend (asset-host) port')
  .option('--frontend-strict-port', 'Fail if the frontend port is already in use')
  .option('--backend-strict-port', 'Fail if the backend port is already in use')
  .action(async (options: GlobalOptions & PortOptions & StrictPortOptions) => {
    configureGlobals(options)
    try {
      await runStart({
        cwd: process.cwd(),
        config: options.config,
        host: resolveHost(options.host),
        port: options.port,
        frontendPort: options.frontendPort,
        backendPort: options.backendPort,
        frontendStrictPort: options.frontendStrictPort,
        backendStrictPort: options.backendStrictPort,
      })
    } catch (e) {
      log.error((e as Error).message)
      process.exit(1)
    }
  })

cli
  .command('plan [phase]', "Print the resolver's plan (phase: dev|build|start)")
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal seam details')
  .option('--host [host]', 'Public host to embed in the resolved topology (default: 0.0.0.0 when flag is bare)')
  .option('--frontend-port <port>', 'Override the frontend port in the plan')
  .option('--backend-port <port>', 'Override the backend port in the plan')
  .action(
    async (
      phase: string | undefined,
      options: GlobalOptions & PortOptions & { json?: boolean },
    ) => {
      configureGlobals(options)
      try {
        await runPlan({
          cwd: process.cwd(),
          config: options.config,
          phase,
          json: !!options.json,
          host: resolveHost(options.host),
          port: options.port,
          frontendPort: options.frontendPort,
          backendPort: options.backendPort,
        })
      } catch (e) {
        log.error((e as Error).message)
        process.exit(1)
      }
    },
  )

cli.help()
cli.version('0.1.0')
cli.parse()
