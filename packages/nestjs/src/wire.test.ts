import { afterEach, describe, expect, it } from 'vitest'
import {
  NESTJS_WIRE_ENV,
  readNestjsWire,
  writeNestjsWire,
  type NestjsWire,
} from './wire.js'

afterEach(() => {
  delete process.env[NESTJS_WIRE_ENV]
})

describe('nestjs wire', () => {
  it('round-trips through write → env → read', () => {
    const value: NestjsWire = { mode: 'prod', port: 3000, distDir: '/tmp/dist' }
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire(value)
    expect(readNestjsWire()).toEqual(value)
  })

  it('round-trips without distDir', () => {
    const value: NestjsWire = { mode: 'dev', port: 42109 }
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire(value)
    expect(readNestjsWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readNestjsWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[NESTJS_WIRE_ENV] = '{not json'
    expect(readNestjsWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[NESTJS_WIRE_ENV] = JSON.stringify({ mode: 'wat', port: 'no' })
    expect(readNestjsWire()).toBeNull()
  })
})
