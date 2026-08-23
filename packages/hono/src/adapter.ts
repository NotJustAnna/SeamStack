import {
  createHostServeable,
  type HostFrameworkOptions,
  type Serveable,
} from '@seamstack/core'
import { HONO_WIRE_ENV, writeHonoWire } from './wire.js'

/**
 * See {@link HostFrameworkOptions} for `entry`, `runtime`, `watch`, `routes`,
 * `buildTool`, and `runner`.
 */
export interface HonoAdapterOptions extends HostFrameworkOptions {}

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
    ...opts,
    framework: 'hono',
    defaultMountPath: '/api',
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
