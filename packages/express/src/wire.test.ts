import { afterEach, describe, expect, it } from 'vitest'
import {
  EXPRESS_WIRE_ENV,
  readExpressWire,
  writeExpressWire,
  type ExpressWire,
} from './wire.js'

afterEach(() => {
  delete process.env[EXPRESS_WIRE_ENV]
})

describe('express wire', () => {
  it('round-trips through write → env → read', () => {
    const value: ExpressWire = { mode: 'prod', port: 3000, distDir: '/tmp/dist' }
    process.env[EXPRESS_WIRE_ENV] = writeExpressWire(value)
    expect(readExpressWire()).toEqual(value)
  })

  it('round-trips without distDir', () => {
    const value: ExpressWire = { mode: 'dev', port: 42109 }
    process.env[EXPRESS_WIRE_ENV] = writeExpressWire(value)
    expect(readExpressWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readExpressWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[EXPRESS_WIRE_ENV] = '{not json'
    expect(readExpressWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[EXPRESS_WIRE_ENV] = JSON.stringify({ mode: 'wat', port: 'no' })
    expect(readExpressWire()).toBeNull()
  })
})
