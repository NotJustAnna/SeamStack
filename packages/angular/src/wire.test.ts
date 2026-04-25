import { afterEach, describe, expect, it } from 'vitest'
import {
  ANGULAR_WIRE_ENV,
  readAngularWire,
  writeAngularWire,
} from './wire.js'

afterEach(() => {
  delete process.env[ANGULAR_WIRE_ENV]
})

describe('angular wire', () => {
  it('returns null when env is unset', () => {
    expect(readAngularWire()).toBeNull()
  })

  it('returns null on invalid JSON', () => {
    process.env[ANGULAR_WIRE_ENV] = '{not-json'
    expect(readAngularWire()).toBeNull()
  })

  it('returns null on missing/wrong shape', () => {
    process.env[ANGULAR_WIRE_ENV] = JSON.stringify({ port: 'x', mode: 'dev' })
    expect(readAngularWire()).toBeNull()
    process.env[ANGULAR_WIRE_ENV] = JSON.stringify({ port: 5000, mode: 'nope' })
    expect(readAngularWire()).toBeNull()
  })

  it('round-trips a dev wire with proxy', () => {
    const wire = {
      mode: 'dev' as const,
      port: 4567,
      proxy: { '/api/**': 'http://localhost:30000' },
    }
    process.env[ANGULAR_WIRE_ENV] = writeAngularWire(wire)
    expect(readAngularWire()).toEqual(wire)
  })

  it('round-trips a prod wire without proxy', () => {
    const wire = { mode: 'prod' as const, port: 8080 }
    process.env[ANGULAR_WIRE_ENV] = writeAngularWire(wire)
    expect(readAngularWire()).toEqual(wire)
  })
})
