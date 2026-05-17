import { describe, expect, it } from 'vitest'
import { renderAstroConfig } from '../engine/generators/astro-config.js'
import { renderSeamConfig } from '../engine/generators/seam-config.js'
import { renderTsconfig } from '../engine/generators/tsconfig.js'
import { renderViteConfig } from '../engine/generators/vite-config.js'

describe('renderViteConfig', () => {
  it('emits an empty defineConfig when no fragments', () => {
    expect(renderViteConfig([], 'ts').source).toContain('export default defineConfig({')
  })

  it('merges plugin contributions and dedupes imports', () => {
    const r = renderViteConfig(
      [
        { imports: ["import react from '@vitejs/plugin-react'"], plugins: ['react()'] },
        { imports: ["import { seam } from '@seamstack/vite'"], plugins: ['seam()'] },
      ],
      'ts',
    )
    expect(r.source).toContain("import react from '@vitejs/plugin-react'")
    expect(r.source).toContain("import { seam } from '@seamstack/vite'")
    expect(r.source).toContain('plugins: [react(), seam()]')
  })

  it('picks correct filename for variant', () => {
    expect(renderViteConfig([], 'ts').filename).toBe('vite.config.ts')
    expect(renderViteConfig([], 'js').filename).toBe('vite.config.js')
  })
})

describe('renderAstroConfig', () => {
  it('merges integrations', () => {
    const r = renderAstroConfig([
      { imports: ["import react from '@astrojs/react'"], integrations: ['react()'] },
      { imports: ["import mdx from '@astrojs/mdx'"], integrations: ['mdx()'] },
    ])
    expect(r.source).toContain("import react from '@astrojs/react'")
    expect(r.source).toContain('integrations: [react(), mdx()]')
    expect(r.filename).toBe('astro.config.mjs')
  })
})

describe('renderTsconfig', () => {
  it('returns empty array for angular', () => {
    expect(renderTsconfig('angular', [])).toEqual([])
  })

  it('returns 4 files for vite', () => {
    const files = renderTsconfig('vite', [])
    expect(files.map((f) => f.filename)).toEqual([
      'tsconfig.base.json',
      'tsconfig.json',
      'client/tsconfig.json',
      'server/tsconfig.json',
    ])
  })

  it('uses src/ for astro client dir', () => {
    const files = renderTsconfig('astro', [])
    expect(files.find((f) => f.filename === 'src/tsconfig.json')).toBeDefined()
    expect(files.find((f) => f.filename === 'client/tsconfig.json')).toBeUndefined()
  })

  it('adds shared glob to all tsconfigs when shared addon present', () => {
    const files = renderTsconfig('vite', ['shared'])
    const root = JSON.parse(files.find((f) => f.filename === 'tsconfig.json')!.source) as {
      include: string[]
    }
    const client = JSON.parse(
      files.find((f) => f.filename === 'client/tsconfig.json')!.source,
    ) as { include: string[] }
    const server = JSON.parse(
      files.find((f) => f.filename === 'server/tsconfig.json')!.source,
    ) as { include: string[] }
    expect(root.include).toContain('shared/**/*.ts')
    expect(client.include).toContain('../shared/**/*.ts')
    expect(server.include).toContain('../shared/**/*.ts')
  })

  it('client tsconfig has DOM lib, server tsconfig has node types', () => {
    const files = renderTsconfig('vite', [])
    const client = JSON.parse(
      files.find((f) => f.filename === 'client/tsconfig.json')!.source,
    ) as { compilerOptions: { lib: string[] } }
    const server = JSON.parse(
      files.find((f) => f.filename === 'server/tsconfig.json')!.source,
    ) as { compilerOptions: { types: string[] } }
    expect(client.compilerOptions.lib).toContain('DOM')
    expect(server.compilerOptions.types).toContain('node')
  })
})

describe('renderSeamConfig', () => {
  it('merges fabric entries and adds default port', () => {
    const r = renderSeamConfig(
      [
        {
          imports: ["import vite from '@seamstack/vite/adapter'"],
          fabric: ["vite({ root: './client' })"],
        },
        {
          imports: ["import hono from '@seamstack/hono/adapter'"],
          fabric: ["hono({ entry: './server/index.ts' })"],
        },
      ],
      'ts',
    )
    expect(r.source).toContain("import { defineWeave } from '@seamstack/cli'")
    expect(r.source).toContain("vite({ root: './client' })")
    expect(r.source).toContain("hono({ entry: './server/index.ts' })")
    expect(r.source).toContain('port: 4567')
  })
})
