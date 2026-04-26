import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Serveable, SeamPlugin } from '@seamstack/core'
import { resolveWeave } from './resolver.js'

function makeSource(framework = 'vite', mountPath = '/'): Serveable {
  return {
    kind: 'serveable',
    framework,
    traits: { producesAssets: true, canHostAssets: false, defaultMountPath: mountPath },
    dev: async () => ({ stop: () => {} }),
    build: async () => ({}),
    start: async () => ({ stop: () => {} }),
  }
}

function makeHost(
  framework = 'hono',
  mountPath = '/api',
  routes?: readonly string[],
): Serveable {
  return {
    kind: 'serveable',
    framework,
    traits: { producesAssets: false, canHostAssets: true, defaultMountPath: mountPath },
    ...(routes ? { routes } : {}),
    dev: async () => ({ stop: () => {} }),
    build: async () => ({}),
    start: async () => ({ stop: () => {} }),
  }
}

const stubPlugin: SeamPlugin = { kind: 'plugin', name: 'stub-plugin' }

describe('resolveWeave', () => {
  const originalPort = process.env['PORT']
  beforeEach(() => {
    delete process.env['PORT']
  })
  afterEach(() => {
    if (originalPort === undefined) delete process.env['PORT']
    else process.env['PORT'] = originalPort
  })

  describe('happy path', () => {
    it('assigns publicPort from weave.port', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567 },
        mode: 'dev',
      })
      expect(topology.publicPort).toBe(4567)
      expect(topology.publicUrl).toBe('http://localhost:4567')
      expect(topology.mode).toBe('dev')
    })

    it('falls back to process.env.PORT when weave.port absent', async () => {
      process.env['PORT'] = '5555'
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()] },
        mode: 'dev',
      })
      expect(topology.publicPort).toBe(5555)
    })

    it('defaults to 3000 when nothing else is set', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()] },
        mode: 'dev',
      })
      expect(topology.publicPort).toBe(3000)
    })

    it('asset-source listens on publicPort in dev; asset-host gets a free port', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567 },
        mode: 'dev',
      })
      const source = topology.services.find((s) => s.role === 'asset-source')!
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(source.devPort).toBe(4567)
      expect(host.devPort).toBeGreaterThan(0)
      expect(host.devPort).not.toBe(4567)
      expect(host.prodPort).toBe(4567)
    })

    it('builds routing keyed by route', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567 },
        mode: 'dev',
      })
      expect(topology.routing).toEqual({ '/': 'vite', '/api': 'hono' })
    })

    it('accepts fabric in either order', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeHost(), makeSource()], port: 4567 },
        mode: 'dev',
      })
      expect(topology.services.map((s) => s.role)).toEqual(['asset-source', 'asset-host'])
    })

    it('source.routes is [mountPath]; host.routes defaults to [defaultMountPath]', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567 },
        mode: 'dev',
      })
      const source = topology.services.find((s) => s.role === 'asset-source')!
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(source.routes).toEqual(['/'])
      expect(host.routes).toEqual(['/api'])
    })

    it('topology.plugins defaults to []', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567 },
        mode: 'dev',
      })
      expect(topology.plugins).toEqual([])
    })
  })

  describe('host routes override', () => {
    it('uses host.routes verbatim, replacing defaultMountPath', async () => {
      const topology = await resolveWeave({
        weave: {
          fabric: [makeSource(), makeHost('hono', '/api', ['/api', '/graphql'])],
          port: 4567,
        },
        mode: 'dev',
      })
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(host.routes).toEqual(['/api', '/graphql'])
      expect(host.mountPath).toBe('/api')
    })

    it('omitting /api in routes drops it (not additive)', async () => {
      const topology = await resolveWeave({
        weave: {
          fabric: [makeSource(), makeHost('hono', '/api', ['/graphql'])],
          port: 4567,
        },
        mode: 'dev',
      })
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(host.routes).toEqual(['/graphql'])
      expect(host.mountPath).toBe('/graphql')
    })

    it('routes show up in routing map', async () => {
      const topology = await resolveWeave({
        weave: {
          fabric: [makeSource(), makeHost('hono', '/api', ['/api', '/graphql'])],
          port: 4567,
        },
        mode: 'dev',
      })
      expect(topology.routing).toEqual({
        '/': 'vite',
        '/api': 'hono',
        '/graphql': 'hono',
      })
    })
  })

  describe('plugins', () => {
    it('accepts a minimal plugin (no routes, no hooks)', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost(), stubPlugin], port: 4567 },
        mode: 'dev',
      })
      expect(topology.plugins).toHaveLength(1)
      expect(topology.plugins[0]!.name).toBe('stub-plugin')
      expect(topology.plugins[0]!.routes).toEqual([])
    })

    it('plugin routes fold into host.routes', async () => {
      const trpcPlugin: SeamPlugin = {
        kind: 'plugin',
        name: 'trpc',
        routes: ['/trpc'],
      }
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost(), trpcPlugin], port: 4567 },
        mode: 'dev',
      })
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(host.routes).toEqual(['/api', '/trpc'])
      expect(topology.routing).toEqual({
        '/': 'vite',
        '/api': 'hono',
        '/trpc': 'hono',
      })
    })

    it('multiple plugins contribute routes in declaration order, deduped', async () => {
      const a: SeamPlugin = { kind: 'plugin', name: 'a', routes: ['/x', '/y'] }
      const b: SeamPlugin = { kind: 'plugin', name: 'b', routes: ['/y', '/z'] }
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost(), a, b], port: 4567 },
        mode: 'dev',
      })
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(host.routes).toEqual(['/api', '/x', '/y', '/z'])
    })

    it('plugin overlaps with host route — deduped silently', async () => {
      const p: SeamPlugin = { kind: 'plugin', name: 'p', routes: ['/api', '/extra'] }
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost(), p], port: 4567 },
        mode: 'dev',
      })
      const host = topology.services.find((s) => s.role === 'asset-host')!
      expect(host.routes).toEqual(['/api', '/extra'])
    })

    it('preserves plugin instance reference in resolved topology', async () => {
      const devSpy: SeamPlugin = {
        kind: 'plugin',
        name: 'codegen',
        dev: () => ({ stop: () => {} }),
      }
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost(), devSpy], port: 4567 },
        mode: 'dev',
      })
      expect(topology.plugins[0]!.instance).toBe(devSpy)
    })
  })

  describe('host', () => {
    it('defaults publicHost to localhost', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567 },
        mode: 'dev',
      })
      expect(topology.publicHost).toBe('localhost')
      expect(topology.publicUrl).toBe('http://localhost:4567')
    })

    it('reads publicHost from weave.host', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567, host: '0.0.0.0' },
        mode: 'dev',
      })
      expect(topology.publicHost).toBe('0.0.0.0')
      expect(topology.publicUrl).toBe('http://0.0.0.0:4567')
    })

    it('CLI input.host overrides weave.host', async () => {
      const topology = await resolveWeave({
        weave: { fabric: [makeSource(), makeHost()], port: 4567, host: '0.0.0.0' },
        mode: 'dev',
        host: '127.0.0.1',
      })
      expect(topology.publicHost).toBe('127.0.0.1')
      expect(topology.publicUrl).toBe('http://127.0.0.1:4567')
    })
  })

  describe('validation errors', () => {
    it('rejects plugin with no name', async () => {
      const bad = { kind: 'plugin', name: '' } as SeamPlugin
      await expect(
        resolveWeave({
          weave: { fabric: [makeSource(), makeHost(), bad] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/plugin is missing.*name/i)
    })

    it('rejects plugin route without leading /', async () => {
      const bad: SeamPlugin = { kind: 'plugin', name: 'bad', routes: ['trpc'] }
      await expect(
        resolveWeave({
          weave: { fabric: [makeSource(), makeHost(), bad] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/invalid route/i)
    })

    it('rejects plugin route equal to /', async () => {
      const bad: SeamPlugin = { kind: 'plugin', name: 'bad', routes: ['/'] }
      await expect(
        resolveWeave({
          weave: { fabric: [makeSource(), makeHost(), bad] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/invalid route/i)
    })

    it('rejects host route colliding with source mount', async () => {
      const bad: SeamPlugin = { kind: 'plugin', name: 'bad', routes: ['/'] }
      // The plugin validation fires first; test the resolver-level collision
      // separately with a host whose routes include /.
      const sourceAtSlash = makeSource('vite', '/')
      const hostAtRoot = makeHost('hono', '/api', ['/api'])
      // Should pass — / belongs to source, /api to host.
      await expect(
        resolveWeave({
          weave: { fabric: [sourceAtSlash, hostAtRoot] },
          mode: 'dev',
        }),
      ).resolves.toBeDefined()
      // Now force a collision by giving the host a route equal to the source mount.
      // Since validateRoutes rejects '/', use a non-default source mount.
      const sourceAtFoo = makeSource('vite', '/foo')
      const hostCollides = makeHost('hono', '/api', ['/api', '/foo'])
      await expect(
        resolveWeave({
          weave: { fabric: [sourceAtFoo, hostCollides] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/mount path collision/i)
      // Reference the unused var so TS doesn't complain.
      void bad
    })

    it('rejects fabric with no asset-source', async () => {
      await expect(
        resolveWeave({ weave: { fabric: [makeHost()] }, mode: 'dev' }),
      ).rejects.toThrow(/asset-producing AND one asset-hosting/i)
    })

    it('rejects fabric with no asset-host', async () => {
      await expect(
        resolveWeave({ weave: { fabric: [makeSource()] }, mode: 'dev' }),
      ).rejects.toThrow(/asset-producing AND one asset-hosting/i)
    })

    it('rejects two asset-sources (defineStitch hint)', async () => {
      await expect(
        resolveWeave({
          weave: { fabric: [makeSource('vite'), makeSource('astro'), makeHost()] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/disambiguate.*defineStitch/is)
    })

    it('rejects two asset-hosts', async () => {
      await expect(
        resolveWeave({
          weave: { fabric: [makeSource(), makeHost('hono'), makeHost('express')] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/disambiguate/i)
    })

    it('rejects mount-path collision', async () => {
      await expect(
        resolveWeave({
          weave: { fabric: [makeSource('vite', '/'), makeHost('hono', '/')] },
          mode: 'dev',
        }),
      ).rejects.toThrow(/mount path collision/i)
    })
  })
})
