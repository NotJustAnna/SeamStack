import {
  createHostServeable,
  type Serveable,
  type WatchSetting,
} from '@seamstack/core'
import { HONO_WIRE_ENV, writeHonoWire } from './wire.js'

export interface HonoAdapterOptions {
  /**
   * Path to the Hono entry file (the one that creates the app and calls
   * `seam(...)`), relative to the seam project root. Required.
   */
  readonly entry: string
  /** Runtime to spawn under. Only `'node'` is supported today. */
  readonly runtime?: 'node'
  /**
   * Dev-server watch behavior. Defaults to `true` (tsx watches `entry` and its
   * imports). See {@link WatchSetting}.
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
 * Hono asset-host adapter.
 *
 * Spawns your Hono entry under `tsx` in `seam dev` and `seam start`. Pair with
 * any asset-source (vite, astro, angular). In dev, the asset-source proxies
 * the host's mount path to this server; in prod, the host serves the built
 * SPA via the `inlay` middleware returned from `seam()`.
 *
 * Pass to {@link defineWeave}'s `fabric` array.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import hono from '@seamstack/hono/adapter'
 *
 * export default defineWeave({
 *   fabric: [vite({ root: './client' }), hono({ entry: './server/index.ts' })],
 * })
 * ```
 */
export default function hono(opts: HonoAdapterOptions): Serveable {
  return createHostServeable({
    framework: 'hono',
    defaultMountPath: '/api',
    entry: opts.entry,
    ...(opts.runtime ? { runtime: opts.runtime } : {}),
    ...(opts.watch !== undefined ? { watch: opts.watch } : {}),
    ...(opts.routes ? { routes: opts.routes } : {}),
    writeWireEnv(input) {
      return {
        [HONO_WIRE_ENV]: writeHonoWire({
          mode: input.mode,
          host: input.host,
          port: input.port,
          ...(input.distDir ? { distDir: input.distDir } : {}),
        }),
      }
    },
  })
}
