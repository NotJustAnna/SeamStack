import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundException, type INestApplication } from '@nestjs/common'
import { SeamModule, SeamSpaFilter } from './module.js'
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

describe('SeamModule.stitch(app).listen()', () => {
  function fakeApp(): { app: INestApplication; calls: unknown[][] } {
    const calls: unknown[][] = []
    const app = {
      listen: (...args: unknown[]) => {
        calls.push(args)
        return Promise.resolve('server')
      },
    } as unknown as INestApplication
    return { app, calls }
  }

  it('binds the wire host/port when running under seam', async () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'prod', host: '0.0.0.0', port: 9999 })
    const { app, calls } = fakeApp()
    const stitch = SeamModule.stitch(app)
    expect(stitch.host).toBe('0.0.0.0')
    expect(stitch.port).toBe(9999)
    await stitch.listen()
    expect(calls).toEqual([[9999, '0.0.0.0']])
  })

  it('defaults are fallbacks-only: the wire wins over them', async () => {
    process.env[NESTJS_WIRE_ENV] = writeNestjsWire({ mode: 'prod', host: '0.0.0.0', port: 9999 })
    const { app, calls } = fakeApp()
    const stitch = SeamModule.stitch(app).defaultPort(1234).defaultHost('192.168.1.1')
    expect(stitch.host).toBe('0.0.0.0')
    expect(stitch.port).toBe(9999)
    await stitch.listen()
    expect(calls).toEqual([[9999, '0.0.0.0']])
  })

  it('standalone with no host default omits the host argument, keeping Nest\'s own default', async () => {
    const { app, calls } = fakeApp()
    const stitch = SeamModule.stitch(app)
    expect(stitch.host).toBeUndefined()
    expect(stitch.port).toBe(3000)
    await stitch.listen()
    expect(calls).toEqual([[3000]])
  })

  it('standalone applies chained defaults', async () => {
    const { app, calls } = fakeApp()
    const stitch = SeamModule.stitch(app).defaultPort(1234).defaultHost('192.168.1.1')
    expect(stitch.host).toBe('192.168.1.1')
    expect(stitch.port).toBe(1234)
    await stitch.listen()
    expect(calls).toEqual([[1234, '192.168.1.1']])
  })

  it('defaults({ ... }) merges over earlier defaults', async () => {
    const { app, calls } = fakeApp()
    const stitch = SeamModule.stitch(app).defaultHost('10.0.0.1').defaults({ port: 1234 })
    expect(stitch.host).toBe('10.0.0.1')
    expect(stitch.port).toBe(1234)
    await stitch.listen()
    expect(calls).toEqual([[1234, '10.0.0.1']])
  })

  it('each default*() returns a new stitch; the original stays untouched', () => {
    const { app } = fakeApp()
    const base = SeamModule.stitch(app)
    const withPort = base.defaultPort(1234)
    expect(base.port).toBe(3000)
    expect(withPort.port).toBe(1234)
    expect(withPort).not.toBe(base)
  })

  it('standalone still respects $PORT over the port default', async () => {
    process.env['PORT'] = '8888'
    const { app, calls } = fakeApp()
    const stitch = SeamModule.stitch(app).defaultPort(1234)
    expect(stitch.port).toBe(8888)
    await stitch.listen()
    expect(calls).toEqual([[8888]])
  })

  it('resolves to app.listen()\'s own result', async () => {
    const { app } = fakeApp()
    await expect(SeamModule.stitch(app).listen()).resolves.toBe('server')
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
