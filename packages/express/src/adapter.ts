import {
  createHostServeable,
  type Serveable,
  type WatchSetting,
} from '@seamstack/core'
import { EXPRESS_WIRE_ENV, writeExpressWire } from './wire.js'

export interface ExpressAdapterOptions {
  /**
   * Path to the Express entry file (the one that creates the app and calls
   * `seam(...)`), relative to the seam project root. Required.
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
    framework: 'express',
    defaultMountPath: '/api',
    entry: opts.entry,
    ...(opts.runtime ? { runtime: opts.runtime } : {}),
    ...(opts.watch !== undefined ? { watch: opts.watch } : {}),
    ...(opts.routes ? { routes: opts.routes } : {}),
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
