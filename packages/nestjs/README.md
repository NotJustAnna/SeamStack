# @seamstack/nestjs

NestJS backend adapter for [SeamStack](https://github.com/NotJustAnna/SeamStack).

```bash
pnpm add @seamstack/nestjs @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/serve-static
```

## Usage

Wire the adapter in `seam.config.ts`. Nothing to configure: the adapter reads `nest-cli.json` and drives `nest start --watch` in dev / `nest build` in prod.

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import nestjs from '@seamstack/nestjs/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), nestjs()],
  port: 4567,
})
```

Add `SeamModule.forRoot()` to your root module. It serves the built SPA in prod and registers a 404 → `index.html` filter so client-side routing keeps working:

```ts
import { Module } from '@nestjs/common'
import { SeamModule } from '@seamstack/nestjs'

@Module({
  imports: [SeamModule.forRoot()],
})
export class AppModule {}
```

`SeamModule.forRoot()` is a no-op in dev (Vite/Astro/Angular handle the frontend then). In prod it wires `@nestjs/serve-static` to the manifest written by `seam build` and routes unmatched GET/HEAD requests through `SeamSpaFilter`.

In `main.ts`, stitch the app to the seam and listen:

```ts
import { NestFactory } from '@nestjs/core'
import { SeamModule } from '@seamstack/nestjs'
import { AppModule } from './app.module.js'

const app = await NestFactory.create(AppModule)
await SeamModule.stitch(app).defaultPort(3000).listen()
```

`defaultPort()` / `defaultHost()` / `defaults({ host, port })` are exactly what they say — defaults. They apply only when not running under `seam` (e.g. `node dist/main.js` directly); the seam's wire always wins. With no seam and no host default, `listen()` omits the host argument entirely so Nest keeps its own default (listen on all interfaces), same as a stock `app.listen(port)`.

A stitch is immutable and fully resolved the moment you hold it — each `default*()` returns a new stitch, and the readonly `host`/`port` fields are exactly what `listen()` binds:

```ts
const stitch = SeamModule.stitch(app).defaultPort(3000)
await stitch.listen()
console.log(`listening on port ${stitch.port}`)
```

(For the actually bound address, Nest's own `await app.getUrl()` is still the authority.)

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and CLI docs.
