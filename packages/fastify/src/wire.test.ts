import { afterEach, describe, expect, it } from 'vitest'
import {
  FASTIFY_WIRE_ENV,
  readFastifyWire,
  writeFastifyWire,
  type FastifyWire,
} from './wire.js'

afterEach(() => {
  delete process.env[FASTIFY_WIRE_ENV]
})

describe('fastify wire', () => {
  it('round-trips through write → env → read', () => {
    const value: FastifyWire = { mode: 'prod', port: 3000, distDir: '/tmp/dist' }
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire(value)
    expect(readFastifyWire()).toEqual(value)
  })

  it('round-trips without distDir', () => {
    const value: FastifyWire = { mode: 'dev', port: 42109 }
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire(value)
    expect(readFastifyWire()).toEqual(value)
  })

  it('returns null when env is missing', () => {
    expect(readFastifyWire()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    process.env[FASTIFY_WIRE_ENV] = '{not json'
    expect(readFastifyWire()).toBeNull()
  })

  it('returns null when shape is wrong', () => {
    process.env[FASTIFY_WIRE_ENV] = JSON.stringify({ mode: 'wat', port: 'no' })
    expect(readFastifyWire()).toBeNull()
  })
})
