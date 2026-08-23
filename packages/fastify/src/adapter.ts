import {
  createHostServeable,
  type HostFrameworkOptions,
  type Serveable,
} from '@seamstack/core'
import { FASTIFY_WIRE_ENV, writeFastifyWire } from './wire.js'

/**
 * See {@link HostFrameworkOptions} for `entry`, `runtime`, `watch`, `routes`,
 * `buildTool`, and `runner`.
 */
export interface FastifyAdapterOptions extends HostFrameworkOptions {}

/**
 * Fastify asset-host adapter.
 *
 * Spawns your Fastify entry under `tsx` in `seam dev` and `seam start`. Pair
 * with any asset-source. In prod, register the plugin returned from `seam()`
 * after your routes to serve the built SPA.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import fastify from '@seamstack/fastify/adapter'
 *
 * export default defineWeave({
 *   fabric: [vite({ root: './client' }), fastify({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function fastify(opts: FastifyAdapterOptions): Serveable {
  return createHostServeable({
    ...opts,
    framework: 'fastify',
    defaultMountPath: '/api',
    writeWireEnv(input) {
      return {
        [FASTIFY_WIRE_ENV]: writeFastifyWire({
          mode: input.mode,
          host: input.host,
          port: input.port,
          ...(input.distDir ? { distDir: input.distDir } : {}),
        }),
      }
    },
  })
}
