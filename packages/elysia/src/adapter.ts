import {
  createHostServeable,
  type Serveable,
  type WatchSetting,
} from '@seamstack/core'
import { ELYSIA_WIRE_ENV, writeElysiaWire } from './wire.js'

export interface ElysiaAdapterOptions {
  /**
   * Path to the Elysia entry file (the one that creates the app and uses the
   * `seam` plugin), relative to the seam project root. Required.
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
    framework: 'elysia',
    defaultMountPath: '/api',
    entry: opts.entry,
    ...(opts.runtime ? { runtime: opts.runtime } : {}),
    ...(opts.watch !== undefined ? { watch: opts.watch } : {}),
    ...(opts.routes ? { routes: opts.routes } : {}),
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
