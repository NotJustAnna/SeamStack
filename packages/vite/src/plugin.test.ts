import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seam } from './plugin.js'
import { VITE_WIRE_ENV, writeViteWire } from './wire.js'

function callConfig(plugin: ReturnType<typeof seam>, command: 'serve' | 'build' = 'serve') {
  const hook = plugin.config
  // Vite types `config` as `ObjectHook<fn>` — either the function or `{handler, order}`.
  // The hook here doesn't read `this`, so cast to a plain callable for the test.
  const fn = (typeof hook === 'function' ? hook : hook?.handler) as
    | ((c: Record<string, unknown>, e: { command: 'serve' | 'build'; mode: string; isPreview: boolean; isSsrBuild: boolean }) => unknown)
    | undefined
  if (!fn) throw new Error('config hook is not callable')
  return fn({}, { command, mode: 'development', isPreview: false, isSsrBuild: false })
}

describe('@seamstack/vite plugin', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    delete process.env[VITE_WIRE_ENV]
  })

  it('returns nothing during build (no-op for non-serve)', () => {
    process.env[VITE_WIRE_ENV] = writeViteWire({ mode: 'dev', port: 4567 })
    const result = callConfig(seam(), 'build')
    expect(result).toBeUndefined()
  })

  it('configures port and proxy when wire env is present', () => {
    process.env[VITE_WIRE_ENV] = writeViteWire({
      mode: 'dev',
      port: 4567,
      proxy: { '/api': 'http://localhost:42109' },
    })
    const result = callConfig(seam())
    expect(result).toEqual({
      server: {
        port: 4567,
        strictPort: true,
        proxy: {
          '/api': { target: 'http://localhost:42109', changeOrigin: true, ws: true },
        },
      },
    })
  })

  it('omits proxy when wire has no proxy field', () => {
    process.env[VITE_WIRE_ENV] = writeViteWire({ mode: 'dev', port: 4567 })
    const result = callConfig(seam())
    expect(result).toEqual({ server: { port: 4567, strictPort: true } })
  })

  it('propagates host from wire env into server.host', () => {
    process.env[VITE_WIRE_ENV] = writeViteWire({ mode: 'dev', host: '0.0.0.0', port: 4567 })
    const result = callConfig(seam())
    expect(result).toEqual({
      server: { port: 4567, strictPort: true, host: '0.0.0.0' },
    })
  })

  it('warns and returns nothing when wire env is missing', () => {
    const result = callConfig(seam())
    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/SEAM_INTERNAL__VITE_ADAPTER/)
  })

  it('warns and returns nothing when wire env is malformed', () => {
    process.env[VITE_WIRE_ENV] = 'not json'
    const result = callConfig(seam())
    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledOnce()
  })
})
