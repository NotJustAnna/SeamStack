import { basename, extname } from 'node:path'
import type { Configuration } from 'webpack'
import type { BuildTool, BuildToolContext, BuildToolOutput, BuildToolWatchHandle } from '@seamstack/core'

export interface WebpackBuildOptions extends Partial<Configuration> {}

function isBareSpecifier(request: string): boolean {
  return !request.startsWith('.') && !request.startsWith('/')
}

function configFor(ctx: BuildToolContext, options: WebpackBuildOptions | undefined): {
  config: Configuration
  outfile: string
} {
  const outName = basename(ctx.entryPath, extname(ctx.entryPath)) + '.js'
  const config: Configuration = {
    mode: 'production',
    target: 'node20.0',
    entry: ctx.entryPath,
    output: {
      path: ctx.serverDir,
      filename: outName,
      module: true,
      library: { type: 'module' },
    },
    experiments: { outputModule: true },
    externalsType: 'module',
    externals: [
      ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
        if (request && isBareSpecifier(request)) return callback(null, request)
        callback()
      },
    ],
    resolve: { extensions: ['.ts', '.tsx', '.js', '.mjs'] },
    module: {
      // transpileOnly: like the other transpile-focused build tools here
      // (tsc, swc), type errors don't block a production build — `seam
      // typecheck` / your editor already cover type safety.
      rules: [
        {
          test: /\.tsx?$/,
          use: { loader: 'ts-loader', options: { transpileOnly: true } },
          exclude: /node_modules/,
        },
      ],
    },
    devtool: 'source-map',
    ...options,
  }
  return { config, outfile: `${ctx.serverDir}/${outName}` }
}

/**
 * webpack {@link BuildTool} — bundles the server entry (and everything it
 * imports) into a single ESM module, leaving bare `node_modules` imports
 * external. Uses `ts-loader` for TypeScript.
 *
 * `fastify({ buildTool: webpack() })`
 */
export default function webpackBuildTool(options?: WebpackBuildOptions): BuildTool {
  return {
    name: 'webpack',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      const { default: webpack } = await import('webpack')
      const { config, outfile } = configFor(ctx, options)
      const compiler = webpack(config)
      await new Promise<void>((resolvePromise, reject) => {
        compiler.run((err, stats) => {
          compiler.close(() => {
            if (err) return reject(err)
            if (stats?.hasErrors()) return reject(new Error(stats.toString({ colors: false })))
            resolvePromise()
          })
        })
      })
      return { entryPath: outfile }
    },
    async watch(
      ctx: BuildToolContext,
      onRebuild: (out: BuildToolOutput) => void,
    ): Promise<BuildToolWatchHandle> {
      const { default: webpack } = await import('webpack')
      const { config, outfile } = configFor(ctx, options)
      const compiler = webpack(config)
      const watching = compiler.watch({}, (err, stats) => {
        if (!err && !stats?.hasErrors()) onRebuild({ entryPath: outfile })
      })
      return {
        stop() {
          return new Promise<void>((resolvePromise) => watching!.close(() => resolvePromise()))
        },
      }
    },
  }
}
