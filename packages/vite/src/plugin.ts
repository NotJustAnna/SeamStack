import type { Plugin } from 'vite'
import { readViteWire, VITE_WIRE_ENV } from './wire.js'

type ProxyEntry = { target: string; changeOrigin: boolean; ws: boolean }

/**
 * Vite plugin that wires your client into SeamStack.
 *
 * In dev, reads the seam-assigned port/host and proxy targets from the wire
 * env, and applies them to Vite's dev server config (so the asset-host's API
 * mount path is proxied automatically). No-op for `vite build` — the build
 * config is whatever you wrote in `vite.config.ts`.
 *
 * If no wire env is present (running `vite` directly without seam), it logs a
 * warning and does nothing, so your normal Vite workflow keeps working.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vite'
 * import { seam } from '@seamstack/vite'
 *
 * export default defineConfig({
 *   plugins: [seam()],
 * })
 * ```
 */
export function seam(): Plugin {
  return {
    name: '@seamstack/vite',
    config(_config, { command }) {
      if (command !== 'serve') return

      const wire = readViteWire()
      if (!wire) {
        console.warn(
          `[@seamstack/vite] no ${VITE_WIRE_ENV} detected — running standalone (no proxy, default port).`,
        )
        return
      }

      let proxy: Record<string, ProxyEntry> | undefined
      if (wire.proxy) {
        proxy = {}
        for (const [path, target] of Object.entries(wire.proxy)) {
          proxy[path] = { target, changeOrigin: true, ws: true }
        }
      }

      return {
        server: {
          port: wire.port,
          strictPort: true,
          ...(wire.host ? { host: wire.host } : {}),
          ...(proxy ? { proxy } : {}),
        },
      }
    },
  }
}
