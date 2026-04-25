import { afterEach, describe, expect, it } from 'vitest'
import {
  ASTRO_WIRE_ENV,
  readAstroWire,
  writeAstroWire,
  type AstroWire,
} from './wire.js'

afterEach(() => {
  delete process.env[ASTRO_WIRE_ENV]
})

describe('astro wire', () => {
  it('round-trips through write → env → read', () => {
    const value: AstroWire = {
      mode: 'dev',
      port: 4567,
      proxy: { '/api': 'http://localhost:42109' },
    }
    process.env[ASTRO_WIRE_ENV] = writeAstroWire(value)
    expect(readAstroWire()).toEqual(value)
  })

  it('round-trips without proxy', () => {
    const value: AstroWire = { mode: 'dev', port: 4567 }
    process.env[ASTRO_WIRE_ENV] = writeAstroWire(value)
    expect(readAstroWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readAstroWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[ASTRO_WIRE_ENV] = '{not json'
    expect(readAstroWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[ASTRO_WIRE_ENV] = JSON.stringify({ mode: 'wat', port: 'no' })
    expect(readAstroWire()).toBeNull()
  })
})
