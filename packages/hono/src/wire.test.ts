import { afterEach, describe, expect, it } from 'vitest'
import { HONO_WIRE_ENV, readHonoWire, writeHonoWire, type HonoWire } from './wire.js'

afterEach(() => {
  delete process.env[HONO_WIRE_ENV]
})

describe('hono wire', () => {
  it('round-trips through write → env → read', () => {
    const value: HonoWire = { mode: 'prod', port: 3000, distDir: '/tmp/dist' }
    process.env[HONO_WIRE_ENV] = writeHonoWire(value)
    expect(readHonoWire()).toEqual(value)
  })

  it('round-trips without distDir', () => {
    const value: HonoWire = { mode: 'dev', port: 42109 }
    process.env[HONO_WIRE_ENV] = writeHonoWire(value)
    expect(readHonoWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readHonoWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[HONO_WIRE_ENV] = '{not json'
    expect(readHonoWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[HONO_WIRE_ENV] = JSON.stringify({ mode: 'wat', port: 'no' })
    expect(readHonoWire()).toBeNull()
  })
})
