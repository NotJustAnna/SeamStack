import { afterEach, describe, expect, it } from 'vitest'
import {
  ELYSIA_WIRE_ENV,
  readElysiaWire,
  writeElysiaWire,
  type ElysiaWire,
} from './wire.js'

afterEach(() => {
  delete process.env[ELYSIA_WIRE_ENV]
})

describe('elysia wire', () => {
  it('round-trips through write → env → read', () => {
    const value: ElysiaWire = { mode: 'prod', port: 3000, distDir: '/tmp/dist' }
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire(value)
    expect(readElysiaWire()).toEqual(value)
  })

  it('round-trips without distDir', () => {
    const value: ElysiaWire = { mode: 'dev', port: 42109 }
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire(value)
    expect(readElysiaWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readElysiaWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[ELYSIA_WIRE_ENV] = '{not json'
    expect(readElysiaWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[ELYSIA_WIRE_ENV] = JSON.stringify({ mode: 'wat', port: 'no' })
    expect(readElysiaWire()).toBeNull()
  })
})
