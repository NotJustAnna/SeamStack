import type { Browser, BrowserContext } from 'playwright'
import { chromium } from 'playwright'
import type { MatrixSpec } from './enumerate.js'
import { bootBudgetMs, expectedApiBody, pageExpectations } from './expectations.js'
import { waitForPort } from './port.js'

let sharedBrowser: Browser | undefined

async function browser(): Promise<Browser> {
  if (sharedBrowser) return sharedBrowser
  sharedBrowser = await chromium.launch({ headless: true })
  return sharedBrowser
}

export async function shutdownBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {})
    sharedBrowser = undefined
  }
}

export interface ProbeResult {
  /** True if HTTP `/` and `/api/hello` returned the expected shape. */
  http: { ok: boolean; details: string[] }
  /** True if Playwright loaded the page without console.error / pageerror. */
  browser: { ok: boolean; details: string[] }
}

async function probeHttp(spec: MatrixSpec, port: number): Promise<{ ok: boolean; details: string[] }> {
  const details: string[] = []
  let ok = true

  await waitForPort(port, bootBudgetMs(spec.host))

  // Give the server a brief settle window — astro/angular SSR may need a beat after the port opens.
  await new Promise((r) => setTimeout(r, 500))

  const home = await safeFetch(`http://localhost:${port}/`)
  if (!home) {
    return { ok: false, details: ['GET / failed (network)'] }
  }
  if (home.status !== 200) {
    ok = false
    details.push(`GET / status=${home.status}`)
  }
  const ct = home.headers.get('content-type') ?? ''
  if (!ct.includes('text/html')) {
    ok = false
    details.push(`GET / content-type=${ct}`)
  }
  const homeBody = await home.text()
  const expect = pageExpectations(spec)
  if (expect.bodyContains && !homeBody.includes(expect.bodyContains)) {
    ok = false
    details.push(`GET / body missing '${expect.bodyContains}'`)
  }

  const api = await safeFetch(`http://localhost:${port}/api/hello`)
  if (!api) {
    return { ok: false, details: [...details, 'GET /api/hello failed (network)'] }
  }
  if (api.status !== 200) {
    ok = false
    details.push(`GET /api/hello status=${api.status}`)
  } else {
    const body = (await api.json().catch(() => null)) as { msg?: string } | null
    const want = expectedApiBody(spec.backend).msg
    if (body?.msg !== want) {
      ok = false
      details.push(`GET /api/hello msg=${JSON.stringify(body)}, want ${want}`)
    }
  }

  return { ok, details }
}

async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url)
  } catch {
    return null
  }
}

async function probeBrowser(spec: MatrixSpec, port: number): Promise<{ ok: boolean; details: string[] }> {
  const details: string[] = []
  const errors: string[] = []
  let ctx: BrowserContext | undefined
  try {
    const b = await browser()
    ctx = await b.newContext({ ignoreHTTPSErrors: true })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text()
        // Filter noisy benign errors
        if (txt.includes('Failed to load resource') && txt.includes('favicon')) return
        errors.push(`console.error: ${txt}`)
      }
    })

    const url = `http://localhost:${port}/`
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    if (!resp || !resp.ok()) {
      details.push(`page.goto ${url} status=${resp?.status() ?? 'null'}`)
      return { ok: false, details }
    }

    const expect = pageExpectations(spec)
    try {
      await page.waitForSelector(expect.marker, { timeout: 10_000 })
    } catch {
      details.push(`marker '${expect.marker}' not found within 10s`)
      return { ok: false, details: [...details, ...errors] }
    }

    if (errors.length > 0) {
      return { ok: false, details: errors }
    }
    return { ok: true, details: [] }
  } finally {
    if (ctx) await ctx.close().catch(() => {})
  }
}

export async function probeAll(spec: MatrixSpec, port: number): Promise<ProbeResult> {
  const http = await probeHttp(spec, port)
  if (!http.ok) {
    return { http, browser: { ok: false, details: ['skipped — HTTP probe failed'] } }
  }
  const br = await probeBrowser(spec, port)
  return { http, browser: br }
}
