import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import serveStatic from 'serve-static'

export interface ProdManifest {
  readonly assetsDir: string
  readonly indexHtml: string
}

export type NodeMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>

export function createNodeServeAssets(manifest: ProdManifest): NodeMiddleware {
  const root = resolve(manifest.assetsDir)
  const indexHtml = resolve(manifest.indexHtml)
  const staticHandler = serveStatic(root, { index: ['index.html'], fallthrough: true })

  return (req, res, next) => {
    staticHandler(req, res, async (err?: unknown) => {
      if (err) return next(err)
      const method = req.method ?? 'GET'
      if (method !== 'GET' && method !== 'HEAD') return next()
      try {
        const body = await readFile(indexHtml)
        res.statusCode = 200
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('content-length', String(body.byteLength))
        if (method === 'HEAD') return res.end()
        res.end(body)
      } catch (e) {
        next(e)
      }
    })
  }
}
