import {
  createHostServeable,
  type HostFrameworkOptions,
  type Serveable,
} from '@seamstack/core'
import { ELYSIA_WIRE_ENV, writeElysiaWire } from './wire.js'

/**
 * See {@link HostFrameworkOptions} for `entry`, `runtime`, `watch`, `routes`,
 * `buildTool`, and `runner`.
 */
export interface ElysiaAdapterOptions extends HostFrameworkOptions {}

/**
 * Elysia asset-host adapter.
 *
 * Spawns your Elysia entry under `tsx` in `seam dev` and `seam start`. Pair
 * with any asset-source. In prod, mount the plugin returned from `seam()`
 * after your routes to serve the built SPA.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import elysia from '@seamstack/elysia/adapter'
 *
 * export default defineWeave({
 *   fabric: [vite({ root: './client' }), elysia({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function elysia(opts: ElysiaAdapterOptions): Serveable {
  return createHostServeable({
    ...opts,
    framework: 'elysia',
    defaultMountPath: '/api',
    writeWireEnv(input) {
      return {
        [ELYSIA_WIRE_ENV]: writeElysiaWire({
          mode: input.mode,
          host: input.host,
          port: input.port,
          ...(input.distDir ? { distDir: input.distDir } : {}),
        }),
      }
    },
  })
}
