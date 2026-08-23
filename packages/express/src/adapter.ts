import {
  createHostServeable,
  type HostFrameworkOptions,
  type Serveable,
} from '@seamstack/core'
import { EXPRESS_WIRE_ENV, writeExpressWire } from './wire.js'

/**
 * See {@link HostFrameworkOptions} for `entry`, `runtime`, `watch`, `routes`,
 * `buildTool`, and `runner`.
 */
export interface ExpressAdapterOptions extends HostFrameworkOptions {}

/**
 * Express asset-host adapter.
 *
 * Spawns your Express entry under `tsx` in `seam dev` and `seam start`. Pair
 * with any asset-source. In prod, mount the `inlay` returned from `seam()`
 * after your routes to serve the built SPA.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import express from '@seamstack/express/adapter'
 *
 * export default defineWeave({
 *   fabric: [vite({ root: './client' }), express({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function express(opts: ExpressAdapterOptions): Serveable {
  return createHostServeable({
    ...opts,
    framework: 'express',
    defaultMountPath: '/api',
    writeWireEnv(input) {
      return {
        [EXPRESS_WIRE_ENV]: writeExpressWire({
          mode: input.mode,
          host: input.host,
          port: input.port,
          ...(input.distDir ? { distDir: input.distDir } : {}),
        }),
      }
    },
  })
}
