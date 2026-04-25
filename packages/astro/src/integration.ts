import type { AstroIntegration } from 'astro'
import { ASTRO_WIRE_ENV, readAstroWire } from './wire.js'

type ProxyEntry = { target: string; changeOrigin: boolean; ws: boolean }

/**
 * Astro integration that wires your site into SeamStack.
 *
 * In dev, reads the seam-assigned port/host and proxy targets from the wire
 * env, and applies them to Astro's dev server config (so the asset-host's API
 * mount path is proxied automatically). No-op for `astro build`.
 *
 * If no wire env is present (running `astro` directly without seam), it logs
 * a warning and does nothing.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'astro/config'
 * import seam from '@seamstack/astro'
 *
 * export default defineConfig({
 *   integrations: [seam()],
 * })
 * ```
 */
export default function seam(): AstroIntegration {
  return {
    name: '@seamstack/astro',
    hooks: {
      'astro:config:setup'({ command, updateConfig, logger }) {
        if (command !== 'dev') return

        const wire = readAstroWire()
        if (!wire) {
          logger.warn(
            `no ${ASTRO_WIRE_ENV} detected — running standalone (no proxy, default port).`,
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

        updateConfig({
          server: { port: wire.port, host: wire.host ?? 'localhost' },
          vite: {
            server: {
              strictPort: true,
              ...(proxy ? { proxy } : {}),
            },
          },
        })
      },
    },
  }
}
