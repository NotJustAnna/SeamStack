# create-seam

Scaffold a new SeamStack project — pair any frontend with any backend.

```bash
pnpm create seam@latest                 # interactive
npm  create seam@latest -- my-app
yarn create seam            my-app
bun  create seam@latest     my-app
```

## Flags

```
create-seam [name]
  --frontend <vite|astro|angular>
  --backend  <hono|express|fastify|elysia|nestjs>
  --variant  <js|ts>           # only meaningful for non-Angular, non-NestJS pairs
  --pm       <pnpm|npm|yarn|bun>
  --no-install                 # skip dependency install
  --no-git                     # skip `git init`
  --force                      # overwrite a non-empty target
```

If you provide a name and frontend/backend/variant, the scaffolder runs headlessly. Otherwise it falls through to an interactive prompt.

## Support matrix (23 templates)

|              | Hono | Express | Fastify | Elysia | NestJS |
|--------------|:----:|:-------:|:-------:|:------:|:------:|
| **Vite**     | js·ts | js·ts | js·ts | js·ts | ts |
| **Astro**    | js·ts | js·ts | js·ts | js·ts | ts |
| **Angular**  | ts    | ts    | ts    | ts    | ts |

## Maintainer notes

- Source-of-truth templates live at `templates/<name>/` and are workspace members (so `seam dev` works in-tree for dogfooding).
- `pnpm build` runs `tsup` + `scripts/build-templates.ts`, which copies `templates/*` to `dist/templates/*` and rewrites every `workspace:*` dep to a concrete `^x.y.z` from the matching adapter package.
- JS variants are generated from their TS siblings by `scripts/generate-js-variants.ts` (idempotent — re-run after editing a TS template to refresh its JS variant).
