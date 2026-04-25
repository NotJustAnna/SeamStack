import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNodeServeAssets } from './runtime.js'

let dir: string
let app: express.Express

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'seam-express-rt-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><body>app</body>', 'utf8')
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'assets', 'main.js'), 'console.log(1)', 'utf8')
  await writeFile(join(dir, 'assets', 'style.css'), 'body{}', 'utf8')

  app = express()
  app.get('/api/echo', (_req, res) => {
    res.json({ ok: true })
  })
  app.use(createNodeServeAssets({ assetsDir: dir, indexHtml: join(dir, 'index.html') }))
})

afterEach(() => {
  /* mkdtemp dirs are GCed by OS */
})

describe('express runtime serveAssets (serve-static)', () => {
  it('does not intercept matched API routes', async () => {
    const res = await request(app).get('/api/echo')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('serves index.html for the root with correct MIME', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('app')
  })

  it('serves a JS asset with correct MIME', async () => {
    const res = await request(app).get('/assets/main.js')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/javascript')
    expect(res.text).toContain('console.log')
  })

  it('serves a CSS asset with correct MIME', async () => {
    const res = await request(app).get('/assets/style.css')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/css')
  })

  it('falls back to index.html for SPA paths', async () => {
    const res = await request(app).get('/some/spa/route')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('app')
  })

  it('only serves index.html on GET/HEAD; falls through on other methods', async () => {
    const res = await request(app).post('/some/spa/route')
    expect(res.status).toBe(404)
  })
})
