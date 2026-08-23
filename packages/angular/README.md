# @seamstack/angular

Angular frontend adapter for [SeamStack](https://github.com/NotJustAnna/SeamStack).

```bash
pnpm add @seamstack/angular
```

Peer-depends on `@angular-devkit/architect` and `@angular-devkit/core`. Supports Angular 17 through 21.

## Usage

Wire the adapter in `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import angular from '@seamstack/angular/adapter'
import hono from '@seamstack/hono/adapter'

export default defineWeave({
  fabric: [angular({ project: 'web' }), hono({ entry: './server/index.ts' })],
  port: 4567,
})
```

`project` is the project name from your `angular.json`. Nothing else changes: no custom builder, no `angular.json` edits. The adapter drives `ng serve` in dev and `ng build` in prod.

In `seam dev`, Angular runs in a worker thread (for stdout isolation) and is reachable through the seam's public URL. In `seam build`, the seam invokes Angular's normal build and hands the manifest to your backend adapter.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
