import { existsSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { composeProject } from '../engine/index.js'
import type { ProjectSpec } from '../engine/spec.js'
import { generateJsVariants } from '../../scripts/generate-js-variants.js'

const here = dirname(fileURLToPath(import.meta.url))
const LAYERS_SRC = join(here, '..', '..', 'layers')

let tmpRoot: string
const created: string[] = []

beforeAll(async () => {
  // Generate JS variants in-tree so JS-variant compositions work without `pnpm build`.
  // Idempotent and fast — only walks layers with hasJsVariant: true.
  const queue: string[] = [LAYERS_SRC]
  while (queue.length > 0) {
    const dir = queue.shift()!
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      if (entry.name === 'files' || entry.name === 'files-ts' || entry.name === 'files-js') continue
      queue.push(join(dir, entry.name))
    }
    const manifestPath = join(dir, '_layer.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { hasJsVariant?: boolean }
    if (manifest.hasJsVariant) {
      await generateJsVariants(join(dir, 'files-ts'), join(dir, 'files-js'))
    }
  }
  tmpRoot = await fs.mkdtemp(join(tmpdir(), 'create-seam-test-'))
})

afterEach(async () => {
  for (const dir of created.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function compose(spec: ProjectSpec): Promise<string> {
  const target = join(tmpRoot, `${spec.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  created.push(target)
  await composeProject(spec, target, { layersDir: LAYERS_SRC })
  return target
}

describe('composeProject — vite + react + ts + hono', () => {
  it('produces the expected files and configs', async () => {
    const target = await compose({
      name: 'demo',
      host: 'vite',
      ui: 'react',
      variant: 'ts',
      backend: 'hono',
      addons: [],
    })

    expect(existsSync(join(target, 'package.json'))).toBe(true)
    expect(existsSync(join(target, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(target, 'seam.config.ts'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.base.json'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(target, 'client/tsconfig.json'))).toBe(true)
    expect(existsSync(join(target, 'server/tsconfig.json'))).toBe(true)
    expect(existsSync(join(target, 'client/main.tsx'))).toBe(true)
    expect(existsSync(join(target, 'client/index.html'))).toBe(true)
    expect(existsSync(join(target, 'server/index.ts'))).toBe(true)

    const vite = await fs.readFile(join(target, 'vite.config.ts'), 'utf8')
    expect(vite).toContain("import react from '@vitejs/plugin-react'")
    expect(vite).toContain("import { seam } from '@seamstack/vite'")
    expect(vite).toContain('react(), seam()')

    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("import vite from '@seamstack/vite/adapter'")
    expect(seam).toContain("import hono from '@seamstack/hono/adapter'")
    expect(seam).toContain("vite({ root: './client' })")
    expect(seam).toContain("hono({ entry: './server/index.ts', runtime: 'tsx', devRuntime: 'tsx' })")

    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8')) as {
      name: string
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.name).toBe('demo')
    expect(pkg.dependencies.react).toBeDefined()
    expect(pkg.dependencies.hono).toBeDefined()
    expect(pkg.devDependencies['@vitejs/plugin-react']).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
    expect(pkg.devDependencies.vite).toBeDefined()
  })
})

describe('composeProject — astro multi-UI + tailwind', () => {
  it('contributes integrations from each selected UI and tailwind plugin', async () => {
    const target = await compose({
      name: 'demo-astro',
      host: 'astro',
      ui: ['react', 'mdx'],
      variant: 'ts',
      backend: 'hono',
      addons: ['tailwind'],
    })

    expect(existsSync(join(target, 'astro.config.mjs'))).toBe(true)
    const cfg = await fs.readFile(join(target, 'astro.config.mjs'), 'utf8')
    expect(cfg).toContain("import react from '@astrojs/react'")
    expect(cfg).toContain("import mdx from '@astrojs/mdx'")
    expect(cfg).toContain("import tailwindcss from '@tailwindcss/vite'")
    expect(cfg).toContain('react(), mdx()')

    expect(existsSync(join(target, 'src/styles/global.css'))).toBe(true)

    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.dependencies['@astrojs/react']).toBeDefined()
    expect(pkg.dependencies['@astrojs/mdx']).toBeDefined()
    expect(pkg.devDependencies.tailwindcss).toBeDefined()
  })
})

describe('composeProject — astro + react + ts + hono', () => {
  it('overrides index.astro to import a working React component', async () => {
    const target = await compose({
      name: 'demo-astro-react',
      host: 'astro',
      ui: ['react'],
      variant: 'ts',
      backend: 'hono',
      addons: [],
    })

    expect(existsSync(join(target, 'src/components/ReactGreeting.tsx'))).toBe(true)

    const page = await fs.readFile(join(target, 'src/pages/index.astro'), 'utf8')
    expect(page).toContain("import ReactGreeting from '../components/ReactGreeting'")
    expect(page).toContain('<ReactGreeting')
    expect(page).toContain('client:load')

    const comp = await fs.readFile(join(target, 'src/components/ReactGreeting.tsx'), 'utf8')
    expect(comp).toContain("from 'react'")
    expect(comp).toContain('/api/hello')
  })

  it('strips types in the JS variant', async () => {
    const target = await compose({
      name: 'demo-astro-react-js',
      host: 'astro',
      ui: ['react'],
      variant: 'js',
      backend: 'hono',
      addons: [],
    })

    expect(existsSync(join(target, 'src/components/ReactGreeting.jsx'))).toBe(true)
    expect(existsSync(join(target, 'src/components/ReactGreeting.tsx'))).toBe(false)
    const comp = await fs.readFile(join(target, 'src/components/ReactGreeting.jsx'), 'utf8')
    expect(comp).not.toContain(': string')
    expect(comp).not.toContain('as Error')
  })
})

describe('composeProject — addon usage in demo', () => {
  it('vite + react + trpc: main.tsx imports trpc and calls trpc.hello.query', async () => {
    const target = await compose({
      name: 'demo-vite-react-trpc',
      host: 'vite',
      ui: 'react',
      variant: 'ts',
      backend: 'hono',
      addons: ['trpc'],
    })
    const main = await fs.readFile(join(target, 'client/main.tsx'), 'utf8')
    expect(main).toContain("import { trpc } from './lib/trpc'")
    expect(main).toContain('trpc.hello.query()')
    expect(main).not.toContain("fetch('/api/hello')")
    expect(existsSync(join(target, 'client/lib/trpc.ts'))).toBe(true)
  })

  it('vite + react + graphql: main.tsx imports graphqlRequest and uses it', async () => {
    const target = await compose({
      name: 'demo-vite-react-gql',
      host: 'vite',
      ui: 'react',
      variant: 'ts',
      backend: 'hono',
      addons: ['graphql'],
    })
    const main = await fs.readFile(join(target, 'client/main.tsx'), 'utf8')
    expect(main).toContain("import { graphqlRequest } from './lib/graphql'")
    expect(main).toContain("graphqlRequest<{ hello: string }>('{ hello }')")
    expect(main).not.toContain("fetch('/api/hello')")
    expect(existsSync(join(target, 'client/lib/graphql.ts'))).toBe(true)
  })

  it('vite + react + tailwind: main.tsx uses tailwind classes', async () => {
    const target = await compose({
      name: 'demo-vite-react-tw',
      host: 'vite',
      ui: 'react',
      variant: 'ts',
      backend: 'hono',
      addons: ['tailwind'],
    })
    const main = await fs.readFile(join(target, 'client/main.tsx'), 'utf8')
    expect(main).toContain('className="font-sans p-8 max-w-2xl mx-auto"')
    expect(main).not.toContain('fontFamily:')
    expect(existsSync(join(target, 'client/styles.css'))).toBe(true)
  })

  it('astro + react + trpc: lib lands at src/lib (not client/), component calls trpc', async () => {
    const target = await compose({
      name: 'demo-astro-react-trpc',
      host: 'astro',
      ui: ['react'],
      variant: 'ts',
      backend: 'hono',
      addons: ['trpc'],
    })
    expect(existsSync(join(target, 'src/lib/trpc.ts'))).toBe(true)
    expect(existsSync(join(target, 'client/lib/trpc.ts'))).toBe(false)
    const comp = await fs.readFile(
      join(target, 'src/components/ReactGreeting.tsx'),
      'utf8',
    )
    expect(comp).toContain("import { trpc } from '../lib/trpc'")
    expect(comp).toContain('trpc.hello.query()')
  })

  it('astro + svelte + tailwind: page wrapper uses tailwind classes', async () => {
    const target = await compose({
      name: 'demo-astro-svelte-tw',
      host: 'astro',
      ui: ['svelte'],
      variant: 'ts',
      backend: 'hono',
      addons: ['tailwind'],
    })
    const page = await fs.readFile(join(target, 'src/pages/index.astro'), 'utf8')
    expect(page).toContain('class="font-sans p-8 max-w-2xl mx-auto"')
    expect(page).not.toContain('font-family: system-ui')
  })
})

describe('composeProject — astro vanilla + ts + hono', () => {
  it('produces an Astro project with no UI integrations', async () => {
    const target = await compose({
      name: 'demo-vanilla',
      host: 'astro',
      ui: [],
      variant: 'ts',
      backend: 'hono',
      addons: [],
    })

    expect(existsSync(join(target, 'astro.config.mjs'))).toBe(true)
    const cfg = await fs.readFile(join(target, 'astro.config.mjs'), 'utf8')
    expect(cfg).toContain("import { defineConfig } from 'astro/config'")
    expect(cfg).toContain('export default defineConfig({')
    expect(cfg).not.toContain('@astrojs/react')
    expect(cfg).not.toContain('@astrojs/vue')
    expect(cfg).not.toContain('@astrojs/svelte')
    expect(cfg).not.toContain('@astrojs/preact')
    expect(cfg).not.toContain('@astrojs/mdx')
    expect(cfg).not.toContain('integrations:')

    expect(existsSync(join(target, 'src/pages/index.astro'))).toBe(true)

    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("import astro from '@seamstack/astro/adapter'")
    expect(seam).toContain('astro()')

    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.dependencies.astro).toBeDefined()
    expect(pkg.dependencies.hono).toBeDefined()
    for (const dep of Object.keys(pkg.dependencies)) {
      expect(dep.startsWith('@astrojs/')).toBe(false)
    }
    expect(pkg.dependencies.react).toBeUndefined()
    expect(pkg.dependencies.vue).toBeUndefined()
    expect(pkg.dependencies.svelte).toBeUndefined()
    expect(pkg.dependencies.preact).toBeUndefined()
    expect(pkg.devDependencies['@seamstack/cli']).toBeDefined()
    expect(pkg.devDependencies['@seamstack/astro']).toBeDefined()
    expect(pkg.devDependencies.tsx).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
  })
})

describe('composeProject — vite + svelte + js + fastify + trpc', () => {
  it('produces a JS variant with stripped types and trpc wiring', async () => {
    const target = await compose({
      name: 'demo-js',
      host: 'vite',
      ui: 'svelte',
      variant: 'js',
      backend: 'fastify',
      addons: ['trpc'],
    })

    expect(existsSync(join(target, 'vite.config.js'))).toBe(true)
    expect(existsSync(join(target, 'seam.config.js'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.json'))).toBe(false)
    expect(existsSync(join(target, 'client/main.js'))).toBe(true)
    expect(existsSync(join(target, 'client/App.svelte'))).toBe(true)
    expect(existsSync(join(target, 'server/index.js'))).toBe(true)
    expect(existsSync(join(target, 'server/trpc/router.js'))).toBe(true)
    expect(existsSync(join(target, 'server/trpc/mount.js'))).toBe(true)

    const main = await fs.readFile(join(target, 'client/main.js'), 'utf8')
    expect(main).not.toContain(': string')
    expect(main).not.toContain('import type')

    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.dependencies.svelte).toBeDefined()
    expect(pkg.dependencies.fastify).toBeDefined()
    expect(pkg.dependencies['@trpc/server']).toBeDefined()
    expect(pkg.devDependencies?.typescript).toBeUndefined()
  })
})

describe('composeProject — angular + nestjs + tailwind + graphql', () => {
  it('produces the angular shell + nestjs server + tailwind postcss + graphql', async () => {
    const target = await compose({
      name: 'demo-ng',
      host: 'angular',
      ui: null,
      variant: 'ts',
      backend: 'nestjs',
      addons: ['tailwind', 'graphql'],
    })

    expect(existsSync(join(target, 'angular.json'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(target, 'tsconfig.app.json'))).toBe(true)
    expect(existsSync(join(target, 'src/main.ts'))).toBe(true)
    expect(existsSync(join(target, 'src/app/app.component.ts'))).toBe(true)
    expect(existsSync(join(target, 'src/styles.css'))).toBe(true)
    expect(existsSync(join(target, '.postcssrc.json'))).toBe(true)
    expect(existsSync(join(target, 'server/main.ts'))).toBe(true)
    expect(existsSync(join(target, 'server/app.module.ts'))).toBe(true)
    expect(existsSync(join(target, 'server/graphql/schema.ts'))).toBe(true)

    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("import angular from '@seamstack/angular/adapter'")
    expect(seam).toContain("import nestjs from '@seamstack/nestjs/adapter'")
    expect(seam).toContain('angular()')
    expect(seam).toContain('nestjs()')

    const styles = await fs.readFile(join(target, 'src/styles.css'), 'utf8')
    expect(styles).toContain('@import "tailwindcss"')
  })
})

describe('composeProject — vite + react + ts + hono + shared', () => {
  it('creates shared/index.ts and includes it in all tsconfigs', async () => {
    const target = await compose({
      name: 'demo-shared',
      host: 'vite',
      ui: 'react',
      variant: 'ts',
      backend: 'hono',
      addons: ['shared'],
    })

    expect(existsSync(join(target, 'shared/index.ts'))).toBe(true)

    const root = JSON.parse(await fs.readFile(join(target, 'tsconfig.json'), 'utf8')) as {
      include: string[]
    }
    expect(root.include).toContain('shared/**/*.ts')

    const client = JSON.parse(
      await fs.readFile(join(target, 'client/tsconfig.json'), 'utf8'),
    ) as { include: string[] }
    expect(client.include).toContain('../shared/**/*.ts')

    const server = JSON.parse(
      await fs.readFile(join(target, 'server/tsconfig.json'), 'utf8'),
    ) as { include: string[] }
    expect(server.include).toContain('../shared/**/*.ts')
  })
})

describe('composeProject — invalid spec', () => {
  it('rejects vite without ui', async () => {
    await expect(
      compose({
        name: 'bad',
        host: 'vite',
        ui: null,
        variant: 'ts',
        backend: 'hono',
        addons: [],
      }),
    ).rejects.toThrow(/Invalid project spec/)
  })

  it('rejects trpc with vite + lit', async () => {
    await expect(
      compose({
        name: 'bad',
        host: 'vite',
        ui: 'lit',
        variant: 'ts',
        backend: 'hono',
        addons: ['trpc'],
      }),
    ).rejects.toThrow(/Invalid project spec/)
  })

  it('rejects shared addon on angular', async () => {
    await expect(
      compose({
        name: 'bad',
        host: 'angular',
        ui: null,
        variant: 'ts',
        backend: 'nestjs',
        addons: ['shared'],
      }),
    ).rejects.toThrow(/Invalid project spec/)
  })
})

describe('composeProject — buildTool / runtime', () => {
  it('no build: omits runtime from fabric and adds tsx as the only extra devDep', async () => {
    const target = await compose({
      name: 'nobuild',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'fastify',
      addons: [],
    })
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("fastify({ entry: './server/index.ts' })")
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.tsx).toBeDefined()
  })

  it('no build + explicit non-default runtime: bakes runtime into fabric, no tsx devDep', async () => {
    const target = await compose({
      name: 'nobuildbun',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'fastify',
      addons: [],
      runtime: 'bun',
    })
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("fastify({ entry: './server/index.ts', runtime: 'bun' })")
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.tsx).toBeUndefined()
  })

  it('bundle: adds the buildTool import + devDep, no tsx, no runtime in fabric', async () => {
    const target = await compose({
      name: 'bundleit',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'fastify',
      addons: [],
      buildTool: 'esbuild',
    })
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("import esbuild from '@seamstack/esbuild'")
    expect(seam).toContain("fastify({ entry: './server/index.ts', buildTool: esbuild() })")
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.devDependencies['@seamstack/esbuild']).toBe('workspace:*')
    expect(pkg.devDependencies.tsx).toBeUndefined()
  })

  it('nestjs: buildTool/runtime are rejected outright', async () => {
    await expect(
      compose({
        name: 'nestbad',
        host: 'vite',
        ui: 'vanilla',
        variant: 'ts',
        backend: 'nestjs',
        addons: [],
        buildTool: 'tsc',
      }),
    ).rejects.toThrow(/Invalid project spec/)
  })

  it('nestjs: never gets a tsx devDep even though variant is forced ts', async () => {
    const target = await compose({
      name: 'nestok',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'nestjs',
      addons: [],
    })
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.tsx).toBeUndefined()
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain('nestjs()')
  })
})

describe('composeProject — Hono/Elysia per-engine server binding', () => {
  it('hono: no explicit runtime resolves to the Node engine and keeps @hono/node-server', async () => {
    const target = await compose({
      name: 'hononode',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'hono',
      addons: [],
    })
    const index = await fs.readFile(join(target, 'server/index.ts'), 'utf8')
    expect(index).toContain("from '@hono/node-server'")
    expect(index).not.toContain("from 'hono/bun'")
    expect(index).not.toContain("from 'hono/deno'")
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@hono/node-server']).toBeDefined()
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("runtime: 'tsx'")
    expect(seam).toContain("devRuntime: 'tsx'")
  })

  it('hono: devRuntime is pinned to match runtime — seam dev must not run the Deno/Bun branch under tsx', async () => {
    const target = await compose({
      name: 'honodenodev',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'hono',
      addons: [],
      runtime: 'deno',
    })
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).toContain("runtime: 'deno'")
    expect(seam).toContain("devRuntime: 'deno'")
  })

  it('hono: runtime=bun takes the Bun branch and drops @hono/node-server', async () => {
    const target = await compose({
      name: 'honobun',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'hono',
      addons: [],
      runtime: 'bun',
    })
    const index = await fs.readFile(join(target, 'server/index.ts'), 'utf8')
    expect(index).toContain("from 'hono/bun'")
    expect(index).toContain('Bun.serve(')
    expect(index).not.toContain("from '@hono/node-server'")
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@hono/node-server']).toBeUndefined()
  })

  it('hono: runtime=deno takes the Deno branch', async () => {
    const target = await compose({
      name: 'honodeno',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'hono',
      addons: [],
      runtime: 'deno',
    })
    const index = await fs.readFile(join(target, 'server/index.ts'), 'utf8')
    expect(index).toContain("from 'hono/deno'")
    expect(index).toContain('Deno.serve(')
  })

  it('elysia: no explicit runtime resolves to the Node engine and keeps @elysiajs/node', async () => {
    const target = await compose({
      name: 'elysianode',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'elysia',
      addons: [],
    })
    const index = await fs.readFile(join(target, 'server/index.ts'), 'utf8')
    expect(index).toContain("from '@elysiajs/node'")
    expect(index).toContain('adapter: node()')
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@elysiajs/node']).toBeDefined()
  })

  it('elysia: runtime=deno drops the node adapter and uses Deno.serve', async () => {
    const target = await compose({
      name: 'elysiadeno',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'elysia',
      addons: [],
      runtime: 'deno',
    })
    const index = await fs.readFile(join(target, 'server/index.ts'), 'utf8')
    expect(index).not.toContain('@elysiajs/node')
    expect(index).toContain('Deno.serve(')
    const pkg = JSON.parse(await fs.readFile(join(target, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@elysiajs/node']).toBeUndefined()
  })

  it('elysia: runtime=bun drops the node adapter but keeps .listen()', async () => {
    const target = await compose({
      name: 'elysiabun',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'elysia',
      addons: [],
      runtime: 'bun',
    })
    const index = await fs.readFile(join(target, 'server/index.ts'), 'utf8')
    expect(index).not.toContain('@elysiajs/node')
    expect(index).toContain('app.listen(')
    expect(index).not.toContain('Deno.serve(')
  })

  it('fastify is unaffected: runtime stays omittable and unresolved for a compiled build', async () => {
    const target = await compose({
      name: 'fastifybundle',
      host: 'vite',
      ui: 'vanilla',
      variant: 'ts',
      backend: 'fastify',
      addons: [],
      buildTool: 'esbuild',
    })
    const seam = await fs.readFile(join(target, 'seam.config.ts'), 'utf8')
    expect(seam).not.toContain('runtime:')
  })
})
