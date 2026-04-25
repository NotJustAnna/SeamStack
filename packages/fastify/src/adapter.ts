import {
  createHostServeable,
  type Serveable,
  type WatchSetting,
} from '@seamstack/core'
import { FASTIFY_WIRE_ENV, writeFastifyWire } from './wire.js'

export interface FastifyAdapterOptions {
  /**
   * Path to the Fastify entry file (the one that creates the app and registers
   * the `seam` plugin), relative to the seam project root. Required.
   */
  readonly entry: string
  /** Runtime to spawn under. Only `'node'` is supported today. */
  readonly runtime?: 'node'
  /**
   * Dev-server watch behavior. Defaults to `true`. See {@link WatchSetting}.
   */
  readonly watch?: WatchSetting
  /**
   * Full list of paths your backend serves. **Overrides** the default `/api`:
   * if set, you get exactly what you specify, so include `/api` yourself if
   * you want it. The dev frontend proxies each entry during `seam dev`.
   * Each entry must start with `/` and not equal `/`.
   *
   * @example `routes: ['/api', '/graphql']`
   */
  readonly routes?: readonly string[]
}

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
    framework: 'fastify',
    defaultMountPath: '/api',
    entry: opts.entry,
    ...(opts.runtime ? { runtime: opts.runtime } : {}),
    ...(opts.watch !== undefined ? { watch: opts.watch } : {}),
    ...(opts.routes ? { routes: opts.routes } : {}),
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
