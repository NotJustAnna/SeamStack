import { basename, extname, join } from 'node:path'
import type { OutputOptions, RolldownOptions, WatchOptions as RolldownWatchOptions } from 'rolldown'
import type { BuildTool, BuildToolContext, BuildToolOutput, BuildToolWatchHandle } from '@seamstack/core'

export interface RolldownBuildOptions extends Partial<RolldownOptions> {}

const isExternal = (id: string) => !id.startsWith('.') && !id.startsWith('/')

function resolve(ctx: BuildToolContext, options: RolldownBuildOptions | undefined) {
  const outName = basename(ctx.entryPath, extname(ctx.entryPath)) + '.js'
  const outfile = join(ctx.serverDir, outName)
  const { output, ...rest } = options ?? {}
  const config: RolldownOptions = {
    external: isExternal,
    // This buildTool only ever compiles a Node server entry. Without an
    // explicit platform, rolldown defaults to 'browser' for esm output,
    // which breaks CJS interop: `require()` calls left in bundled
    // CommonJS deps for genuinely external specifiers (including Node
    // builtins) fall back to a runtime require() shim that doesn't exist
    // in Node ESM, crashing at startup instead of resolving normally.
    platform: 'node',
    ...rest,
    input: ctx.entryPath,
  }
  // `format`/`file` are the buildTool's own contract (a single, predictably
  // named entry in `serverDir`) and always win; everything else the caller
  // sets on `output` (e.g. `codeSplitting: false`, needed once dependencies
  // with dynamic `import()` end up bundled in) passes through untouched.
  const outputOptions: OutputOptions = {
    sourcemap: true,
    ...(Array.isArray(output) ? output[0] : output),
    format: 'esm',
    file: outfile,
  }
  return { config, outfile, outputOptions }
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
      const { config, outfile, outputOptions } = resolve(ctx, options)
      const bundle = await rolldown(config)
      try {
        await bundle.write(outputOptions)
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
      const { config, outfile, outputOptions } = resolve(ctx, options)
      const watchOptions: RolldownWatchOptions = {
        ...config,
        output: outputOptions,
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
