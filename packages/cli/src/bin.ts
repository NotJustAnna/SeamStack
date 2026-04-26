#!/usr/bin/env node
import { cac } from 'cac'
import { runDev } from './commands/dev.js'
import { runBuild } from './commands/build.js'
import { runStart } from './commands/start.js'
import { runPlan } from './commands/plan.js'
import { log, setLogLevel } from './logger.js'

interface GlobalOptions {
  verbose?: boolean
  host?: string
}

function configureGlobals(opts: GlobalOptions): void {
  setLogLevel(opts.verbose ? 'verbose' : 'normal')
}

const cli = cac('seam')

cli
  .command('dev', 'Start the dev composition')
  .option('-v, --verbose', 'Show internal seam details (port assignments, spawn args)')
  .option('--host <host>', 'Bind host (e.g. 0.0.0.0 to expose on the LAN)')
  .action(async (options: GlobalOptions) => {
    configureGlobals(options)
    try {
      await runDev({ cwd: process.cwd(), host: options.host })
    } catch (e) {
      log.error((e as Error).message)
      process.exit(1)
    }
  })

cli
  .command('build', 'Build the composition for production')
  .option('-v, --verbose', 'Show internal seam details')
  .option('--host <host>', 'Public host to embed in the resolved topology')
  .action(async (options: GlobalOptions) => {
    configureGlobals(options)
    try {
      await runBuild({ cwd: process.cwd(), host: options.host })
    } catch (e) {
      log.error((e as Error).message)
      process.exit(1)
    }
  })

cli
  .command('start', 'Run the production composition')
  .option('-v, --verbose', 'Show internal seam details')
  .option('--host <host>', 'Bind host (e.g. 0.0.0.0 to expose on the LAN)')
  .action(async (options: GlobalOptions) => {
    configureGlobals(options)
    try {
      await runStart({ cwd: process.cwd(), host: options.host })
    } catch (e) {
      log.error((e as Error).message)
      process.exit(1)
    }
  })

cli
  .command('plan [phase]', "Print the resolver's plan (phase: dev|build|start)")
  .option('--json', 'Output as JSON')
  .option('-v, --verbose', 'Show internal seam details')
  .option('--host <host>', 'Public host to embed in the resolved topology')
  .action(
    async (
      phase: string | undefined,
      options: GlobalOptions & { json?: boolean },
    ) => {
      configureGlobals(options)
      try {
        await runPlan({
          cwd: process.cwd(),
          phase,
          json: !!options.json,
          host: options.host,
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
