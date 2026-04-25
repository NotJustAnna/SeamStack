import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Elysia } from 'elysia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seam, seamHost } from './plugin.js'
import { ELYSIA_WIRE_ENV, writeElysiaWire } from './wire.js'

const originalPort = process.env['PORT']

beforeEach(() => {
  delete process.env[ELYSIA_WIRE_ENV]
  delete process.env['PORT']
})

afterEach(() => {
  delete process.env[ELYSIA_WIRE_ENV]
  if (originalPort === undefined) delete process.env['PORT']
  else process.env['PORT'] = originalPort
})

async function makeManifestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'seam-mw-elysia-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><body>built</body>', 'utf8')
  await writeFile(join(dir, 'app.js'), 'console.log(1)', 'utf8')
  const manifest = { assetsDir: dir, indexHtml: join(dir, 'index.html') }
  await writeFile(
    join(dir, '_seam_prod.js'),
    `export default ${JSON.stringify(manifest)}\n`,
    'utf8',
  )
  return dir
}

describe('seam() port resolution (elysia)', () => {
  it('uses wire.port when wire env is set', () => {
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire({ mode: 'prod', port: 9999 })
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

describe('seamHost() (elysia)', () => {
  it('reads host from wire env', () => {
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire({ mode: 'dev', host: '0.0.0.0', port: 1 })
    expect(seamHost()).toBe('0.0.0.0')
    expect(seam().host).toBe('0.0.0.0')
  })

  it('falls back to fallback then 127.0.0.1', () => {
    expect(seamHost('192.168.1.1')).toBe('192.168.1.1')
    expect(seamHost()).toBe('127.0.0.1')
  })
})

describe('seam elysia plugin', () => {
  it('does not intercept matched routes', async () => {
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire({ mode: 'prod', port: 0 })
    const { inlay } = seam()
    const app = new Elysia().use(await inlay).get('/api/hello', () => ({ msg: 'hi' }))
    const res = await app.handle(new Request('http://localhost/api/hello'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ msg: 'hi' })
  })

  it('returns Elysia default 404 in dev mode', async () => {
    const dir = await makeManifestDir()
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire({ mode: 'dev', port: 0, distDir: dir })
    const { inlay } = seam()
    const app = new Elysia().use(await inlay)
    const res = await app.handle(new Request('http://localhost/missing'))
    expect(res.status).toBe(404)
  })

  it('returns default 404 in prod with no manifest', async () => {
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire({ mode: 'prod', port: 0 })
    const { inlay } = seam()
    const app = new Elysia().use(await inlay)
    const res = await app.handle(new Request('http://localhost/missing'))
    expect(res.status).toBe(404)
  })

  it('serves built assets and falls back to index.html in prod mode', async () => {
    const dir = await makeManifestDir()
    process.env[ELYSIA_WIRE_ENV] = writeElysiaWire({
      mode: 'prod',
      port: 0,
      distDir: dir,
    })

    const { inlay } = seam()
    const app = new Elysia().use(await inlay).get('/api/hello', () => ({ msg: 'hi' }))

    const root = await app.handle(new Request('http://localhost/'))
    expect(root.status).toBe(200)
    expect(await root.text()).toContain('built')

    const spa = await app.handle(new Request('http://localhost/some-spa-route'))
    expect(spa.status).toBe(200)
    expect(await spa.text()).toContain('built')

    const api = await app.handle(new Request('http://localhost/api/hello'))
    expect(api.status).toBe(200)
    expect(await api.json()).toEqual({ msg: 'hi' })
  })
})
