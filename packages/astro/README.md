# @seamstack/astro

Astro frontend adapter for SeamStack — runs Astro's dev server and SSR build through the seam pipeline.

```bash
pnpm add @seamstack/astro astro
```

## Usage

Wire the adapter in `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import astro from '@seamstack/astro/adapter'
import hono from '@seamstack/hono/adapter'

export default defineWeave({
  fabric: [astro({ root: './client' }), hono({ entry: './server/index.ts' })],
  port: 4567,
})
```

That's it. No Astro integration to register, no `astro.config.mjs` edits — the adapter drives Astro programmatically.

In `seam dev`, Astro runs in a worker thread (so its stdout doesn't bleed into the seam's logs) and is reachable through the seam's public URL. In `seam build`, the seam invokes Astro's normal build and hands the manifest to your backend adapter.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
