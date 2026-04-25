import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seam, seamHost } from './plugin.js'
import { FASTIFY_WIRE_ENV, writeFastifyWire } from './wire.js'

const originalPort = process.env['PORT']

beforeEach(() => {
  delete process.env[FASTIFY_WIRE_ENV]
  delete process.env['PORT']
})

afterEach(() => {
  delete process.env[FASTIFY_WIRE_ENV]
  if (originalPort === undefined) delete process.env['PORT']
  else process.env['PORT'] = originalPort
})

async function makeManifestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'seam-mw-fastify-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><body>built</body>', 'utf8')
  const manifest = { assetsDir: dir, indexHtml: join(dir, 'index.html') }
  await writeFile(
    join(dir, '_seam_prod.js'),
    `export default ${JSON.stringify(manifest)}\n`,
    'utf8',
  )
  return dir
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()
  app.get('/api/hello', async () => ({ msg: 'hi' }))
  const { inlay } = seam()
  await app.register(inlay)
  await app.ready()
  return app
}

describe('seam() port resolution (fastify)', () => {
  it('uses wire.port when wire env is set', () => {
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire({ mode: 'prod', port: 9999 })
    expect(seam().port).toBe(9999)
  })

  it('falls back to PORT when wire env is missing', () => {
    process.env['PORT'] = '8888'
    expect(seam().port).toBe(8888)
  })

  it('falls back to options.port when nothing is set', () => {
    expect(seam({ port: 1234 }).port).toBe(1234)
  })

  it('defaults to 3000 when nothing is set and no option given', () => {
    expect(seam().port).toBe(3000)
  })
})

describe('seamHost() (fastify)', () => {
  it('reads host from wire env', () => {
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire({ mode: 'dev', host: '0.0.0.0', port: 1 })
    expect(seamHost()).toBe('0.0.0.0')
    expect(seam().host).toBe('0.0.0.0')
  })

  it('falls back to fallback then 127.0.0.1', () => {
    expect(seamHost('192.168.1.1')).toBe('192.168.1.1')
    expect(seamHost()).toBe('127.0.0.1')
  })
})

describe('seam fastify plugin', () => {
  it('does not intercept matched routes (dev or prod)', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/hello' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ msg: 'hi' })
    await app.close()
  })

  it('returns Fastify default 404 in dev mode', async () => {
    const dir = await makeManifestDir()
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire({
      mode: 'dev',
      port: 0,
      distDir: dir,
    })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/missing' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('passes through to default 404 with no manifest in prod', async () => {
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire({ mode: 'prod', port: 0 })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/missing' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('serves built assets in prod mode with distDir wire', async () => {
    const dir = await makeManifestDir()
    process.env[FASTIFY_WIRE_ENV] = writeFastifyWire({
      mode: 'prod',
      port: 0,
      distDir: dir,
    })

    const app = await buildApp()

    const root = await app.inject({ method: 'GET', url: '/' })
    expect(root.statusCode).toBe(200)
    expect(root.body).toContain('built')

    const spa = await app.inject({ method: 'GET', url: '/some-spa-route' })
    expect(spa.statusCode).toBe(200)
    expect(spa.body).toContain('built')

    const api = await app.inject({ method: 'GET', url: '/api/hello' })
    expect(api.statusCode).toBe(200)
    expect(api.json()).toEqual({ msg: 'hi' })

    await app.close()
  })
})
