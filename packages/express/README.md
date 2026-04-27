# @seamstack/express

Express backend adapter for SeamStack — mounts a Seam frontend on an Express app and serves built assets.

```bash
pnpm add @seamstack/express express
```

## Usage

Wire the adapter in `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import express from '@seamstack/express/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), express({ entry: './server/index.ts' })],
  port: 4567,
})
```

In your Express server, destructure `{ inlay, host, port }` from `seam()` and mount `inlay` after your routes:

```ts
import express from 'express'
import { seam } from '@seamstack/express'

const app = express()
app.get('/api/hello', (_req, res) => res.json({ msg: 'hi from express' }))

const { inlay, host, port } = seam()
app.use(inlay)

app.listen(port, host, () =>
  console.log(`[express] listening on http://${host}:${port}`),
)
```

`inlay` is inert in dev (Vite/Astro/Angular handle the frontend then). In prod it serves the built SPA from the manifest written by `seam build`.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
