import { basename, extname, join } from 'node:path'
import type { RolldownOptions, WatchOptions as RolldownWatchOptions } from 'rolldown'
import type { BuildTool, BuildToolContext, BuildToolOutput, BuildToolWatchHandle } from '@seamstack/core'

export interface RolldownBuildOptions extends Partial<RolldownOptions> {}

const isExternal = (id: string) => !id.startsWith('.') && !id.startsWith('/')

function resolve(ctx: BuildToolContext, options: RolldownBuildOptions | undefined) {
  const outName = basename(ctx.entryPath, extname(ctx.entryPath)) + '.js'
  const outfile = join(ctx.serverDir, outName)
  const config: RolldownOptions = {
    external: isExternal,
    ...options,
    input: ctx.entryPath,
  }
  return { config, outfile }
}

/**
 * Rolldown {@link BuildTool} — bundles the server entry (and everything it
 * imports) into a single ESM file, leaving bare `node_modules` imports
 * external. Rolldown (like esbuild) understands TypeScript syntax natively —
 * no plugin needed.
 *
 * `fastify({ buildTool: rolldown() })`
 */
export default function rolldownBuildTool(options?: RolldownBuildOptions): BuildTool {
  return {
    name: 'rolldown',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      const { rolldown } = await import('rolldown')
      const { config, outfile } = resolve(ctx, options)
      const bundle = await rolldown(config)
      try {
        await bundle.write({ format: 'esm', file: outfile, sourcemap: true })
      } finally {
        await bundle.close()
      }
      return { entryPath: outfile }
    },
    async watch(
      ctx: BuildToolContext,
      onRebuild: (out: BuildToolOutput) => void,
    ): Promise<BuildToolWatchHandle> {
      const { watch } = await import('rolldown')
      const { config, outfile } = resolve(ctx, options)
      const watchOptions: RolldownWatchOptions = {
        ...config,
        output: { format: 'esm', file: outfile, sourcemap: true },
      }
      const watcher = watch(watchOptions)
      watcher.on('event', (event) => {
        if (event.code === 'BUNDLE_END') {
          onRebuild({ entryPath: outfile })
          void event.result?.close()
        } else if (event.code === 'ERROR') {
          void event.result?.close()
        }
      })
      return {
        async stop() {
          await watcher.close()
        },
      }
    },
  }
}
