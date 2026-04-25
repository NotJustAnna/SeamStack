import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { SeamModule, SeamSpaFilter, seamHost, seamPort } from './module.js'
import { NESTJS_WIRE_ENV, writeNestjsWire } from './wire.js'

const originalPort = process.env['PORT']

beforeEach(() => {
  delete process.env[NESTJS_WIRE_ENV]
  delete process.env['PORT']
})

afterEach(() => {
  delete process.env[NESTJS_WIRE_ENV]
  if (originalPort === undefined) delete process.env['PORT']
  else process.env['PORT'] = originalPort
})

describe('SeamModule.port', () => {
  it('uses wire.port when wire env is set', () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'prod', port: 9999 })
    expect(SeamModule.port()).toBe(9999)
  })

  it('falls back to PORT', () => {
    process.env['PORT'] = '8888'
    expect(SeamModule.port()).toBe(8888)
  })

  it('falls back to fallback arg', () => {
    expect(SeamModule.port(1234)).toBe(1234)
  })

  it('defaults to 3000', () => {
    expect(SeamModule.port()).toBe(3000)
  })
})

describe('SeamModule.host / seamHost', () => {
  it('reads host from wire env', () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'dev', host: '0.0.0.0', port: 1 })
    expect(SeamModule.host()).toBe('0.0.0.0')
    expect(seamHost()).toBe('0.0.0.0')
  })

  it('falls back to fallback then 127.0.0.1', () => {
    expect(SeamModule.host('192.168.1.1')).toBe('192.168.1.1')
    expect(SeamModule.host()).toBe('127.0.0.1')
  })
})

describe('seamPort (top-level)', () => {
  it('mirrors SeamModule.port', () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'prod', port: 7777 })
    expect(seamPort()).toBe(7777)
  })
})

describe('SeamModule.forRoot', () => {
  it('returns an empty module in dev mode', async () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'dev', port: 0 })
    const dyn = await SeamModule.forRoot()
    expect(dyn.module).toBe(SeamModule)
    expect(dyn.imports ?? []).toEqual([])
    expect(dyn.providers ?? []).toEqual([])
  })

  it('returns an empty module in prod when manifest is missing', async () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'prod', port: 0 })
    const dyn = await SeamModule.forRoot()
    expect(dyn.module).toBe(SeamModule)
    expect(dyn.imports ?? []).toEqual([])
    expect(dyn.providers ?? []).toEqual([])
  })
})

interface MockReply {
  status: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function makeHost(method: string): {
  host: { switchToHttp(): { getRequest(): { method: string }; getResponse(): MockReply } }
  reply: MockReply
} {
  const reply: MockReply = {
    status: vi.fn(() => reply),
    set: vi.fn(() => reply),
    send: vi.fn(() => reply),
  }
  const host = {
    switchToHttp() {
      return {
        getRequest: () => ({ method }),
        getResponse: () => reply,
      }
    },
  }
  return { host, reply }
}

describe('SeamSpaFilter', () => {
  const indexBody = Buffer.from('<!doctype html><body>built</body>')

  it('serves index.html on GET 404', () => {
    const filter = new SeamSpaFilter(indexBody)
    const { host, reply } = makeHost('GET')
    filter.catch(new NotFoundException(), host as never)
    expect(reply.status).toHaveBeenCalledWith(200)
    expect(reply.set).toHaveBeenCalledWith('content-type', 'text/html; charset=utf-8')
    expect(reply.send).toHaveBeenCalledWith(indexBody)
  })

  it('sends empty body on HEAD 404 with 200', () => {
    const filter = new SeamSpaFilter(indexBody)
    const { host, reply } = makeHost('HEAD')
    filter.catch(new NotFoundException(), host as never)
    expect(reply.status).toHaveBeenCalledWith(200)
    const sent = reply.send.mock.calls[0]?.[0] as Buffer
    expect(sent.byteLength).toBe(0)
  })

  it('returns 404 on POST', () => {
    const filter = new SeamSpaFilter(indexBody)
    const { host, reply } = makeHost('POST')
    filter.catch(new NotFoundException(), host as never)
    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith('Not Found')
  })
})
