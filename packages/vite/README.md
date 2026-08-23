# @seamstack/vite

Vite frontend adapter and plugin for [SeamStack](https://github.com/NotJustAnna/SeamStack).

```bash
pnpm add @seamstack/vite vite
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

Add the Vite plugin in your `vite.config.ts` so the dev server can read the seam's wire env (and proxy `/api` to your backend without you opening this file ever again):

```ts
import { defineConfig } from 'vite'
import { seam } from '@seamstack/vite'

export default defineConfig({
  plugins: [seam()],
})
```

In `seam dev`, Vite runs in-process on the main thread: `createServer()` is awaited directly inside the seam runtime, not spawned. In `seam build`, the seam invokes Vite's normal build and hands the manifest to your backend adapter.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
