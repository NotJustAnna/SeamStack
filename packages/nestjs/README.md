# @seamstack/nestjs

NestJS backend adapter for SeamStack — mounts a Seam frontend on a Nest application and serves built assets.

```bash
pnpm add @seamstack/nestjs @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/serve-static
```

## Usage

Wire the adapter in `seam.config.ts`. Nothing to configure — the adapter reads `nest-cli.json` and drives `nest start --watch` in dev / `nest build` in prod.

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import nestjs from '@seamstack/nestjs/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), nestjs()],
  port: 4567,
})
```

Add `SeamModule.forRoot()` to your root module — it serves the built SPA in prod and registers a 404 → `index.html` filter so client-side routing keeps working:

```ts
import { Module } from '@nestjs/common'
import { SeamModule } from '@seamstack/nestjs'

@Module({
  imports: [SeamModule.forRoot()],
})
export class AppModule {}
```

`SeamModule.forRoot()` is a no-op in dev (Vite/Astro/Angular handle the frontend then). In prod it wires `@nestjs/serve-static` to the manifest written by `seam build` and routes unmatched GET/HEAD requests through `SeamSpaFilter`.

In `main.ts`, bind the host/port the seam picked:

```ts
import { NestFactory } from '@nestjs/core'
import { SeamModule } from '@seamstack/nestjs'
import { AppModule } from './app.module.js'

const app = await NestFactory.create(AppModule)
await app.listen(SeamModule.port(), SeamModule.host())
```

`SeamModule.port()` / `SeamModule.host()` and the standalone `seamPort()` / `seamHost()` exports are equivalent — use whichever reads better at the call site.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
