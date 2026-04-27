# @seamstack/elysia

Elysia backend adapter for SeamStack — mounts a Seam frontend on an Elysia app and serves built assets.

```bash
pnpm add @seamstack/elysia elysia @elysiajs/node
```

## Usage

Wire the adapter in `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import elysia from '@seamstack/elysia/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), elysia({ entry: './server/index.ts' })],
  port: 4567,
})
```

In your Elysia server, destructure `{ inlay, host, port }` from `seam()` and `.use(inlay)` after your routes. `inlay` is a `Promise<Elysia>` — Elysia awaits it before listening.

```ts
import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'
import { seam } from '@seamstack/elysia'

const { inlay, host, port } = seam()

new Elysia({ adapter: node() })
  .get('/api/hello', () => ({ msg: 'hi from elysia' }))
  .use(inlay)
  .listen({ hostname: host, port }, () =>
    console.log(`[elysia] listening on http://${host}:${port}`),
  )
```

`inlay` is inert in dev (Vite/Astro/Angular handle the frontend then). In prod it serves the built SPA via `@elysiajs/static` from the manifest written by `seam build`.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
