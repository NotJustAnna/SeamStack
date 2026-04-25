import { afterEach, describe, expect, it } from 'vitest'
import { readViteWire, VITE_WIRE_ENV, writeViteWire, type ViteWire } from './wire.js'

afterEach(() => {
  delete process.env[VITE_WIRE_ENV]
})

describe('vite wire', () => {
  it('round-trips through write → env → read', () => {
    const value: ViteWire = {
      mode: 'dev',
      port: 4567,
      proxy: { '/api': 'http://localhost:42109' },
    }
    process.env[VITE_WIRE_ENV] = writeViteWire(value)
    expect(readViteWire()).toEqual(value)
  })

  it('round-trips without proxy', () => {
    const value: ViteWire = { mode: 'prod', port: 3000 }
    process.env[VITE_WIRE_ENV] = writeViteWire(value)
    expect(readViteWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readViteWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[VITE_WIRE_ENV] = '{not json'
    expect(readViteWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[VITE_WIRE_ENV] = JSON.stringify({ mode: 'staging', port: 'no' })
    expect(readViteWire()).toBeNull()
  })
})
