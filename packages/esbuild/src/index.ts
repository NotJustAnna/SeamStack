import { basename, extname, join } from 'node:path'
import type { BuildOptions } from 'esbuild'
import type { BuildTool, BuildToolContext, BuildToolOutput, BuildToolWatchHandle } from '@seamstack/core'

export interface EsbuildOptions extends Partial<BuildOptions> {}

const DEFAULTS: BuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  target: 'node20',
  sourcemap: true,
}

function resolve(ctx: BuildToolContext, options: EsbuildOptions | undefined) {
  const outName = basename(ctx.entryPath, extname(ctx.entryPath)) + '.js'
  const outfile = join(ctx.serverDir, outName)
  const config: BuildOptions = {
    ...DEFAULTS,
    ...options,
    entryPoints: [ctx.entryPath],
    outfile,
  }
  return { config, outfile }
}

/**
 * esbuild {@link BuildTool} — SeamStack's original, still-default-shaped
 * compile behavior: bundles the server entry (and everything it imports)
 * into a single ESM file, leaving bare `node_modules` imports external.
 *
 * `fastify({ buildTool: esbuild() })`
 */
export default function esbuild(options?: EsbuildOptions): BuildTool {
  return {
    name: 'esbuild',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      const { build } = await import('esbuild')
      const { config, outfile } = resolve(ctx, options)
      await build(config)
      return { entryPath: outfile }
    },
    async watch(
      ctx: BuildToolContext,
      onRebuild: (out: BuildToolOutput) => void,
    ): Promise<BuildToolWatchHandle> {
      const { context } = await import('esbuild')
      const { config, outfile } = resolve(ctx, options)
      const esbuildCtx = await context({
        ...config,
        plugins: [
          ...(config.plugins ?? []),
          {
            name: 'seam-on-rebuild',
            setup(build) {
              build.onEnd(() => {
                onRebuild({ entryPath: outfile })
              })
            },
          },
        ],
      })
      await esbuildCtx.watch()
      return {
        async stop() {
          await esbuildCtx.dispose()
        },
      }
    },
  }
}
