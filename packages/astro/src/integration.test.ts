import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seam from './integration.js'
import { ASTRO_WIRE_ENV, writeAstroWire } from './wire.js'

interface SetupArg {
  command: 'dev' | 'build' | 'preview'
  updateConfig: ReturnType<typeof vi.fn>
  logger: { warn: ReturnType<typeof vi.fn> }
}

function makeSetupArg(command: SetupArg['command']): SetupArg {
  return {
    command,
    updateConfig: vi.fn(),
    logger: { warn: vi.fn() },
  }
}

beforeEach(() => {
  delete process.env[ASTRO_WIRE_ENV]
})

afterEach(() => {
  delete process.env[ASTRO_WIRE_ENV]
})

describe('@seamstack/astro integration', () => {
  it('returns nothing during build (no-op for non-dev)', () => {
    process.env[ASTRO_WIRE_ENV] = writeAstroWire({ mode: 'dev', port: 4567 })
    const integration = seam()
    const arg = makeSetupArg('build')
    integration.hooks['astro:config:setup']?.(arg as never)
    expect(arg.updateConfig).not.toHaveBeenCalled()
  })

  it('configures port and proxy when wire env is present', () => {
    process.env[ASTRO_WIRE_ENV] = writeAstroWire({
      mode: 'dev',
      port: 4568,
      proxy: { '/api': 'http://localhost:42109' },
    })
    const integration = seam()
    const arg = makeSetupArg('dev')
    integration.hooks['astro:config:setup']?.(arg as never)
    expect(arg.updateConfig).toHaveBeenCalledOnce()
    expect(arg.updateConfig).toHaveBeenCalledWith({
      server: { port: 4568, host: 'localhost' },
      vite: {
        server: {
          strictPort: true,
          proxy: {
            '/api': { target: 'http://localhost:42109', changeOrigin: true, ws: true },
          },
        },
      },
    })
  })

  it('omits proxy when wire has no proxy field', () => {
    process.env[ASTRO_WIRE_ENV] = writeAstroWire({ mode: 'dev', port: 4568 })
    const integration = seam()
    const arg = makeSetupArg('dev')
    integration.hooks['astro:config:setup']?.(arg as never)
    expect(arg.updateConfig).toHaveBeenCalledWith({
      server: { port: 4568, host: 'localhost' },
      vite: { server: { strictPort: true } },
    })
  })

  it('propagates host from wire env into server.host', () => {
    process.env[ASTRO_WIRE_ENV] = writeAstroWire({ mode: 'dev', host: '0.0.0.0', port: 4568 })
    const integration = seam()
    const arg = makeSetupArg('dev')
    integration.hooks['astro:config:setup']?.(arg as never)
    expect(arg.updateConfig).toHaveBeenCalledWith({
      server: { port: 4568, host: '0.0.0.0' },
      vite: { server: { strictPort: true } },
    })
  })

  it('warns and returns nothing when wire env is missing', () => {
    const integration = seam()
    const arg = makeSetupArg('dev')
    integration.hooks['astro:config:setup']?.(arg as never)
    expect(arg.updateConfig).not.toHaveBeenCalled()
    expect(arg.logger.warn).toHaveBeenCalledOnce()
    expect(arg.logger.warn.mock.calls[0]?.[0]).toMatch(/SEAM_INTERNAL__ASTRO_ADAPTER/)
  })

  it('warns when wire env is malformed', () => {
    process.env[ASTRO_WIRE_ENV] = 'not json'
    const integration = seam()
    const arg = makeSetupArg('dev')
    integration.hooks['astro:config:setup']?.(arg as never)
    expect(arg.updateConfig).not.toHaveBeenCalled()
    expect(arg.logger.warn).toHaveBeenCalledOnce()
  })
})
