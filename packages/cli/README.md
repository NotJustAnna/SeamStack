# @seamstack/cli

The `seam` command — dev, build, plan, and start any SeamStack project.

```bash
pnpm add -D @seamstack/cli
```

If you scaffolded with `pnpm create seam@latest`, this is already a dev dependency.

## The `seam` binary

```
seam dev    [-v|--verbose] [--host <host>]
seam build  [-v|--verbose] [--host <host>]
seam start  [-v|--verbose] [--host <host>]
seam plan   [phase] [--json] [-v|--verbose] [--host <host>]
```

- `seam dev` — Boot the dev composition: one URL, frontend hot-reloads, backend handles `/api`.
- `seam build` — Run the frontend's build and write a manifest the backend can find.
- `seam start` — Run the production composition. The backend serves API routes and the built frontend on the same port.
- `seam plan [dev|build|start]` — Print the topology the seam resolved for a phase. `--json` for the machine-readable form. Useful for debugging "why is my backend on a different port than I expected."
- `--host <host>` — Bind the public-facing server. Defaults to `localhost`. `--host 0.0.0.0` exposes to the LAN.
- `-v, --verbose` — Show internal seam details (resolved private ports, debug events). Quiet by default.

## `defineWeave`

`defineWeave` is the typed config helper for `seam.config.ts`:

```ts
import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import hono from '@seamstack/hono/adapter'

export default defineWeave({
  fabric: [vite({ root: './client' }), hono({ entry: './server/index.ts' })],
  port: 4567,
})
```

`fabric` is the array of adapters — typically one frontend (`vite`/`astro`/`angular`) and one backend (`hono`/`express`/`fastify`/`elysia`/`nestjs`), in any order. The seam wires them together. `port` is the public-facing port.

## More

See the [SeamStack README](https://github.com/NotJustAnna/SeamStack#readme) for the bigger picture, the mix-and-match support table, and the philosophy.
