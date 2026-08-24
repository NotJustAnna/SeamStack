# @seamstack/hono

Hono backend adapter for [SeamStack](https://github.com/NotJustAnna/SeamStack).

```bash
pnpm add @seamstack/hono hono @hono/node-server
```

## Usage

Wire the adapter in `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import hono from '@seamstack/hono/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), hono({ entry: './server/index.ts' })],
  port: 4567,
})
```

In your Hono server, destructure `{ inlay, ...opts }` from `seam()` and mount `inlay` after your routes. `opts` is `{ hostname, port }` — named to match `serve()`'s own option, so it spreads straight in:

```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { seam } from '@seamstack/hono'

const app = new Hono()
app.get('/api/hello', (c) => c.json({ msg: 'hi from hono' }))

const { inlay, ...opts } = seam({ serveStatic })
app.use('*', inlay)

serve({ fetch: app.fetch, ...opts }, () =>
  console.log(`[hono] listening on http://${opts.hostname}:${opts.port}`),
)
```

`inlay` is inert in dev (Vite/Astro/Angular handle the frontend then). In prod it serves the built SPA from the manifest written by `seam build`.

You pass your runtime's `serveStatic` factory in: `@hono/node-server/serve-static` for Node, `hono/cloudflare-workers` on the edge, etc. SeamStack stays runtime-agnostic.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
