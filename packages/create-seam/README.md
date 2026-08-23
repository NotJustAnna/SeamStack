# create-seam

Scaffold a new [SeamStack](https://github.com/NotJustAnna/SeamStack) project.

```bash
pnpm create seam@latest                 # interactive
npm  create seam@latest -- my-app
yarn create seam            my-app
bun  create seam@latest     my-app
```

## Flags

```
create-seam [name]
  --host     <vite|astro|angular>             # frontend host
  --ui       <name>                           # vite: one of vanilla|vue|react|preact|svelte|solid|lit|qwik
                                              # astro: comma-separated subset of react|vue|svelte|solid|preact|alpine|mdx
                                              #        (omit for vanilla Astro)
  --backend  <hono|express|fastify|elysia|nestjs>
  --variant  <js|ts>                          # only meaningful for non-Angular, non-NestJS pairs
  --addons   <names>                          # comma-separated: tailwind|trpc|graphql|shared
  --pm       <pnpm|npm|yarn|bun|nub>
  --no-install                                # skip dependency install
  --no-git                                    # skip `git init`
  --force                                     # overwrite a non-empty target
```

If you provide a name plus `--host` and `--backend`, the scaffolder runs headlessly. Otherwise it falls through to an interactive prompt.

`--frontend` is accepted as a deprecated alias of `--host`.

## Support matrix (23 templates)

|              | Hono | Express | Fastify | Elysia | NestJS |
|--------------|:----:|:-------:|:-------:|:------:|:------:|
| **Vite**     | js·ts | js·ts | js·ts | js·ts | ts |
| **Astro**    | js·ts | js·ts | js·ts | js·ts | ts |
| **Angular**  | ts    | ts    | ts    | ts    | ts |

## Maintainer notes

- Source-of-truth templates live at `templates/<name>/` and are workspace members (so `seam dev` works in-tree for dogfooding).
- `pnpm build` runs `tsdown` + `scripts/build-templates.ts`, which copies `templates/*` to `dist/templates/*` and rewrites every `workspace:*` dep to a concrete `^x.y.z` from the matching adapter package.
- JS variants are generated from their TS siblings by `scripts/generate-js-variants.ts` (idempotent: re-run after editing a TS template to refresh its JS variant).
