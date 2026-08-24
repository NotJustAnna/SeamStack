# SeamStack

![SeamStack showcase](./showcase.svg)

SeamStack is the thinnest thing you can put between a frontend tool that doesn't care what serves it and a backend tool that doesn't care what files it ships. One public port. One config file. Three commands. No "platform," as little glue code as possible, and the proxying your frontend already had built in.

This started because I wanted a Fastify backend and a React frontend in the same Docker container, and discovered, through a series of escalating compromises with `vite.config.ts`, that the JavaScript ecosystem has quietly decided this is a framework-shaped problem.

It isn't.

## Getting started

```bash
pnpm create seam@latest                                       # interactive
pnpm create seam@latest my-app --frontend vite --backend hono # or skip the prompts
```

The scaffolder ships 23 templates covering all 15 combinations of three frontends (Vite, Astro, Angular) and five backends (Hono, Express, Fastify, Elysia, NestJS). Vite and Astro come in JavaScript or TypeScript. Angular and NestJS only do TypeScript, because Angular and NestJS only do TypeScript. There are addons too: Tailwind, tRPC, GraphQL, and a `shared/` folder for code both halves import (Vite and Astro only).

The result is a single package with a `seam.config.ts` that looks like this:

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import hono from '@seamstack/hono/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), hono({ entry: './server/index.ts' })],
  port: 4567,
})
```

And three commands:

```bash
seam dev      # one URL, both halves live
seam build    # bundles the client, hands the manifest to your backend
seam start    # backend serves API + built assets on the same port
```

That's the whole product. The interesting part is what's underneath.

## What `seam dev` actually does

Vite, Astro, and Angular all run **in-process**. Not spawned. Not piped through a child shell. Not waiting on a port to come up. `createServer()` is awaited directly inside the seam runtime. (Astro and Angular live in a worker thread for stdout isolation: same process, different worker. Vite is on the main thread.)

The only thing that gets spawned is your backend, via `tsx`. That is the entire process tree.

While the dev server boots, the seam reads the asset-host's mount path (Hono's `/api`, NestJS's `/api`, whatever you've configured) and writes a proxy entry into the frontend dev server's config. A `fetch('/api/things')` from your React component lands on Fastify on a private port without you ever opening `vite.config.ts`. You never see the private port. The seam picks it.

Pick a frontend, pick a backend, run `seam dev`, and you get one URL where the frontend hot-reloads and the API responds. That's the pitch.

## What `seam build` actually does

`seam build` runs the frontend's build (the same Vite/Astro/Angular build you'd run yourself) and writes a manifest the backend can find. The backend's adapter then exports an `inlay`: a Hono middleware, an Express handler, a Fastify plugin, a NestJS module, an Elysia plugin that, in production, serves those built assets next to your API routes.

You don't write a static-files block. You don't pick a directory. The backend already knows where the manifest is, because the build wrote it there.

`seam start` is `node server.js`, more or less, with the manifest pre-resolved.

## Mix and match

Because there is no curated list of "supported pairs," you can do things like put **Angular and NestJS in the same package**. One `package.json`. One install. No monorepo. No Nx. No Turbo. No `pnpm-workspace.yaml`. Two adapters in the `fabric` array, and the seam wires the rest.

You can also do Vite + NestJS. Or Astro + Fastify. Or Angular + Hono. None of these are unusual; they're all the same pattern. The adapters don't know about each other. They only know about the seam.

## Supported frameworks

### Frontends (asset-source)

| Adapter | Mount | Notes |
|---|---|---|
| `@seamstack/vite` | `/` | Programmatic Vite + a plugin that reads the seam's wire env. Main thread. |
| `@seamstack/astro` | `/` | Programmatic Astro + integration. Worker thread (Astro logs to stdout in ways the seam would rather not inherit). |
| `@seamstack/angular` | `/` | Drives `@angular/cli` (`ng serve`/`ng build`) without a custom builder. Worker thread. |

### Backends (asset-host)

| Adapter | Mount | Mounted via |
|---|---|---|
| `@seamstack/hono` | `/api` | `seam({ serveStatic, port })` returning `{ inlay, hostname, port }` |
| `@seamstack/express` | `/api` | `app.use(inlay)` |
| `@seamstack/fastify` | `/api` | `app.register(inlay)` |
| `@seamstack/elysia` | `/api` | Elysia plugin (Node target via `@elysiajs/node`) |
| `@seamstack/nestjs` | `/api` | `SeamModule.forRoot()`; drives the `nest` CLI for dev/build |

Any frontend × any backend is the supported set.

## CLI

```
seam dev    [-v|--verbose] [--host <host>]
seam build  [-v|--verbose] [--host <host>]
seam start  [-v|--verbose] [--host <host>]
seam plan   [phase] [--json] [-v|--verbose] [--host <host>]
```

- `--host <host>`: bind the public-facing server. Defaults to `localhost`. `--host 0.0.0.0` exposes to the LAN.
- `-v, --verbose`: show internal seam details (resolved private ports, debug events). Quiet by default.
- `seam plan [dev|build|start]`: print the topology the seam resolved for a phase. `--json` for the machine-readable form.

## Philosophy

SeamStack is opinionated in the same way Vite is opinionated: the smallest set of decisions required for the thing to work, and not one more.

Most of those decisions are about ports and process boundaries. Which dev server hosts the public URL, which one runs as a child, where the manifest lives, when the proxy gets wired. None of them are about your code. The seam doesn't know what your routes look like, doesn't care what your data layer is, has no opinion on your CSS solution. It picks a frontend tool and a backend tool — both of which were built to live behind something else — and stitches them into the shape they were already trying to be.

Frameworks with full-stack opinions (Next.js, Nuxt, SvelteKit, TanStack Start, Remix, RedwoodJS) ship both halves themselves. They don't need a seam. SeamStack is for when you'd rather pick the two best tools for the job and stitch them yourself.

## See Also

If SeamStack isn't the right fit, here are battle-tested alternatives. Many of them are **named** rather than abstract, because the right answer depends on the pair you're after.

### Fullstack-opinionated frameworks (pick one, get both halves)

- **[Next.js](https://nextjs.org/)**: React, app router, server components, Vercel-flavored.
- **[Nuxt](https://nuxt.com/)**: Vue, Nitro on the back, batteries included.
- **[SvelteKit](https://kit.svelte.dev/)**: Svelte, file-based routing, adapters for any host.
- **[TanStack Start](https://tanstack.com/start)**: React, full-stack with TanStack Router/Query.
- **[Remix](https://remix.run/)**: React, web-fundamentals-first, now part of React Router.
- **[RedwoodJS](https://redwoodjs.com/)**: React + GraphQL/Prisma, opinionated startup stack.

### Curated framework pairings

- **Elysia + frontends**: officially supported via `@elysiajs/*` for SvelteKit, Next.js, TanStack Start, and Astro. Elysia + Nuxt is community-maintained.
- **Hono + Next.js**: Hono ships an official Next.js adapter (`hono/vercel`) for using Hono routes inside a Next.js app.
- **Hono on the edge**: first-class targets for Cloudflare Workers, Bun, Deno, and Vercel Edge.
- **Fastify + Next.js**: the `fastify-nextjs` plugin attaches Next.js to a Fastify instance.
- **NestJS + everything**: official platforms for Express and Fastify; first-party static-file modules (`@nestjs/serve-static`).

The difference is curation: those projects pick a frontend pair and bless it. SeamStack picks neither. Any of our frontends paired with any of our backends just works.

## Status

**v0.3.0.** APIs may shift. The plugin layer (`SeamPlugin`) is wired through the resolver and runs at dev/build/start. Multi-entrypoint composition (`defineStitch`) is still type-only; single-entrypoint projects are the supported shape today.

## License

MIT.
