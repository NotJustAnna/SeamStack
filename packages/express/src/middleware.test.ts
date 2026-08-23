import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seam, seamHost } from './middleware.js'
import { EXPRESS_WIRE_ENV, writeExpressWire } from './wire.js'

const originalPort = process.env['PORT']

beforeEach(() => {
  delete process.env[EXPRESS_WIRE_ENV]
  delete process.env['PORT']
})

afterEach(() => {
  delete process.env[EXPRESS_WIRE_ENV]
  if (originalPort === undefined) delete process.env['PORT']
  else process.env['PORT'] = originalPort
})

async function makeManifestDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'seam-mw-express-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><body>built</body>', 'utf8')
  const manifest = { assetsDir: '.', indexHtml: 'index.html' }
  await writeFile(
    join(dir, '_seam_prod.js'),
    `export default ${JSON.stringify(manifest)}\n`,
    'utf8',
  )
  return dir
}

describe('seam() port resolution (express)', () => {
  it('uses wire.port when wire env is set', () => {
    process.env[EXPRESS_WIRE_ENV] = writeExpressWire({ mode: 'prod', port: 9999 })
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

describe('seamHost() (express)', () => {
  it('reads host from wire env', () => {
    process.env[EXPRESS_WIRE_ENV] = writeExpressWire({ mode: 'dev', host: '0.0.0.0', port: 1 })
    expect(seamHost()).toBe('0.0.0.0')
    expect(seam().host).toBe('0.0.0.0')
  })

  it('falls back to provided fallback when wire absent', () => {
    expect(seamHost('192.168.1.1')).toBe('192.168.1.1')
  })

  it('defaults to 127.0.0.1 when nothing is set', () => {
    expect(seamHost()).toBe('127.0.0.1')
  })
})

describe('seam() express inlay', () => {
  it('passes through to user routes when no wire and no manifest', async () => {
    const { inlay } = seam()
    const app = express()
    app.get('/api/hello', (_req, res) => {
      res.json({ msg: 'hi' })
    })
    app.use(inlay)

    const ok = await request(app).get('/api/hello')
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ msg: 'hi' })

    const miss = await request(app).get('/some-spa-route')
    expect(miss.status).toBe(404)
  })

  it('short-circuits to no-op in dev mode (does not load manifest)', async () => {
    const dir = await makeManifestDir()
    process.env[EXPRESS_WIRE_ENV] = writeExpressWire({
      mode: 'dev',
      port: 0,
      distDir: dir,
    })

    const { inlay } = seam()
    const app = express()
    app.get('/api/hello', (_req, res) => {
      res.json({ msg: 'hi' })
    })
    app.use(inlay)

    const miss = await request(app).get('/')
    expect(miss.status).toBe(404)
  })

  it('serves built assets in prod mode with distDir wire', async () => {
    const dir = await makeManifestDir()
    process.env[EXPRESS_WIRE_ENV] = writeExpressWire({
      mode: 'prod',
      port: 0,
      distDir: dir,
    })

    const { inlay } = seam()
    const app = express()
    app.get('/api/hello', (_req, res) => {
      res.json({ msg: 'hi' })
    })
    app.use(inlay)

    const root = await request(app).get('/')
    expect(root.status).toBe(200)
    expect(root.text).toContain('built')

    const spa = await request(app).get('/some-spa-route')
    expect(spa.status).toBe(200)
    expect(spa.text).toContain('built')

    const api = await request(app).get('/api/hello')
    expect(api.status).toBe(200)
    expect(api.body).toEqual({ msg: 'hi' })
  })
})
