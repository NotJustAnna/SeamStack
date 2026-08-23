import { basename, extname, join } from 'node:path'
import type { Plugin, RollupOptions, RollupWatchOptions } from 'rollup'
import * as tsPluginModule from '@rollup/plugin-typescript'
import type { RollupTypescriptOptions } from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import type { BuildTool, BuildToolContext, BuildToolOutput, BuildToolWatchHandle } from '@seamstack/core'

// `@rollup/plugin-typescript`'s CJS-format .d.ts confuses NodeNext default-import
// resolution (the namespace type, not the callable default, gets inferred) —
// resolve the callable at runtime instead of trusting the default-import type.
const typescript = (tsPluginModule as unknown as { default: (options?: RollupTypescriptOptions) => Plugin })
  .default

export interface RollupBuildOptions extends Partial<RollupOptions> {}

const isExternal = (id: string) => !id.startsWith('.') && !id.startsWith('/')

function resolve(ctx: BuildToolContext, options: RollupBuildOptions | undefined) {
  const outName = basename(ctx.entryPath, extname(ctx.entryPath)) + '.js'
  const outfile = join(ctx.serverDir, outName)
  const config: RollupOptions = {
    external: isExternal,
    plugins: [
      // Resolves extensionless/`.js`-suffixed relative specifiers against
      // `.ts` source files (the common TS-ESM authoring convention) before
      // the typescript plugin transforms whatever it lands on.
      nodeResolve({ extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'] }),
      // `tsconfig: false` avoids inheriting whatever tsconfig.json happens to
      // be nearest cwd (e.g. the consuming project's own, unrelated one) —
      // this plugin's only job is to strip types, not enforce project config.
      typescript({
        tsconfig: false,
        noEmitOnError: false,
        declaration: false,
        declarationMap: false,
        composite: false,
        module: 'ESNext',
        target: 'ES2022',
      }),
    ],
    ...options,
    input: ctx.entryPath,
  }
  return { config, outfile }
}

/**
 * Rollup {@link BuildTool} — bundles the server entry (and everything it
 * imports) into a single ESM file, leaving bare `node_modules` imports
 * external.
 *
 * `fastify({ buildTool: rollup() })`
 */
export default function rollupBuildTool(options?: RollupBuildOptions): BuildTool {
  return {
    name: 'rollup',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      const { rollup } = await import('rollup')
      const { config, outfile } = resolve(ctx, options)
      const bundle = await rollup(config)
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
      const { watch } = await import('rollup')
      const { config, outfile } = resolve(ctx, options)
      const watchOptions: RollupWatchOptions = {
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
