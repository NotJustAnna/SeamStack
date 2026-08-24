import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seam } from './middleware.js'
import { HONO_WIRE_ENV, writeHonoWire } from './wire.js'

const originalPort = process.env['PORT']

beforeEach(() => {
  delete process.env[HONO_WIRE_ENV]
  delete process.env['PORT']
})

afterEach(() => {
  delete process.env[HONO_WIRE_ENV]
  if (originalPort === undefined) delete process.env['PORT']
  else process.env['PORT'] = originalPort
})

async function makeManifestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'seam-mw-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><body>built</body>', 'utf8')
  const manifest = { assetsDir: '.', indexHtml: 'index.html' }
  await writeFile(
    join(dir, '_seam_prod.js'),
    `export default ${JSON.stringify(manifest)}\n`,
    'utf8',
  )
  return dir
}

describe('seam() port resolution', () => {
  it('uses wire.port when wire env is set', () => {
    process.env[HONO_WIRE_ENV] = writeHonoWire({ mode: 'prod', port: 9999 })
    expect(seam({ serveStatic }).port).toBe(9999)
  })

  it('falls back to PORT when wire env is missing', () => {
    process.env['PORT'] = '8888'
    expect(seam({ serveStatic }).port).toBe(8888)
  })

  it('falls back to options.port when nothing is set', () => {
    expect(seam({ serveStatic, port: 1234 }).port).toBe(1234)
  })

  it('is left undefined when nothing is set and no option given, so serve() applies its own default', () => {
    expect(seam({ serveStatic }).port).toBeUndefined()
  })
})

describe('seam() hostname resolution', () => {
  it('reads hostname from wire env', () => {
    process.env[HONO_WIRE_ENV] = writeHonoWire({ mode: 'dev', host: '0.0.0.0', port: 1 })
    expect(seam({ serveStatic }).hostname).toBe('0.0.0.0')
  })

  it('falls back to options.hostname when nothing is set', () => {
    expect(seam({ serveStatic, hostname: '192.168.1.1' }).hostname).toBe('192.168.1.1')
  })

  it('is left undefined when nothing is set and no option given, so serve() applies its own default', () => {
    expect(seam({ serveStatic }).hostname).toBeUndefined()
  })
})

describe('seam() inlay', () => {
  it('passes through to user routes when no wire and no manifest', async () => {
    const { inlay } = seam({ serveStatic })
    const app = new Hono()
    app.use(inlay)
    app.get('/api/hello', (c) => c.json({ msg: 'hi' }))

    const ok = await app.fetch(new Request('http://localhost/api/hello'))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ msg: 'hi' })

    const miss = await app.fetch(new Request('http://localhost/'))
    expect(miss.status).toBe(404)
  })

  it('short-circuits to no-op in dev mode (does not load manifest)', async () => {
    const dir = await makeManifestDir()
    process.env[HONO_WIRE_ENV] = writeHonoWire({ mode: 'dev', port: 0, distDir: dir })

    const { inlay } = seam({ serveStatic })
    const app = new Hono()
    app.use(inlay)
    app.get('/api/hello', (c) => c.json({ msg: 'hi' }))

    const miss = await app.fetch(new Request('http://localhost/'))
    expect(miss.status).toBe(404)
  })

  it('serves built assets in prod mode with distDir wire', async () => {
    const dir = await makeManifestDir()
    process.env[HONO_WIRE_ENV] = writeHonoWire({ mode: 'prod', port: 0, distDir: dir })

    const { inlay } = seam({ serveStatic })
    const app = new Hono()
    app.use(inlay)
    app.get('/api/hello', (c) => c.json({ msg: 'hi' }))

    const root = await app.fetch(new Request('http://localhost/'))
    expect(root.status).toBe(200)
    expect(await root.text()).toContain('built')

    const spa = await app.fetch(new Request('http://localhost/some-spa-route'))
    expect(spa.status).toBe(200)
    expect(await spa.text()).toContain('built')

    const api = await app.fetch(new Request('http://localhost/api/hello'))
    expect(api.status).toBe(200)
    expect(await api.json()).toEqual({ msg: 'hi' })
  })
})
