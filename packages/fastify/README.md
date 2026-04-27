# @seamstack/fastify

Fastify backend adapter for SeamStack — mounts a Seam frontend as a Fastify plugin and serves built assets.

```bash
pnpm add @seamstack/fastify fastify
```

## Usage

Wire the adapter in `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import fastify from '@seamstack/fastify/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), fastify({ entry: './server/index.ts' })],
  port: 4567,
})
```

In your Fastify server, destructure `{ inlay, host, port }` from `seam()` and register `inlay` after your routes:

```ts
import Fastify from 'fastify'
import { seam } from '@seamstack/fastify'

const app = Fastify()
app.get('/api/hello', async () => ({ msg: 'hi from fastify' }))

const { inlay, host, port } = seam()
await app.register(inlay)

await app.listen({ host, port })
console.log(`[fastify] listening on http://${host}:${port}`)
```

`inlay` is inert in dev (Vite/Astro/Angular handle the frontend then). In prod it serves the built SPA via `@fastify/static` from the manifest written by `seam build`.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
