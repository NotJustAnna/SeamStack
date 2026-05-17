import { describe, expect, it } from 'vitest'
import { resolveLayers } from '../engine/layers.js'
import type { ProjectSpec } from '../engine/spec.js'

function spec(overrides: Partial<ProjectSpec>): ProjectSpec {
  return {
    name: 'app',
    host: 'vite',
    ui: 'react',
    variant: 'ts',
    backend: 'hono',
    addons: [],
    ...overrides,
  }
}

describe('resolveLayers', () => {
  it('produces the basic vite chain', () => {
    expect(resolveLayers(spec({})).map((l) => l.id)).toEqual([
      '_base',
      'host/vite',
      'ui/vite/react',
      'variant/ts',
      'backend/hono',
      'seam-glue/vite',
    ])
  })

  it('expands addons', () => {
    const ids = resolveLayers(
      spec({ addons: ['tailwind', 'trpc', 'graphql'] }),
    ).map((l) => l.id)
    expect(ids).toContain('addon/tailwind/vite')
    expect(ids).toContain('addon/trpc/_common')
    expect(ids).toContain('addon/trpc/server/hono')
    expect(ids).toContain('addon/graphql/_common')
    expect(ids).toContain('addon/graphql/server/hono')
  })

  it('shared addon emits a single common layer', () => {
    const ids = resolveLayers(spec({ addons: ['shared'] })).map((l) => l.id)
    expect(ids).toContain('addon/shared/_common')
  })

  it('emits one ui layer per Astro UI selected', () => {
    const ids = resolveLayers(
      spec({ host: 'astro', ui: ['react', 'mdx'] }),
    ).map((l) => l.id)
    expect(ids).toContain('ui/astro/react')
    expect(ids).toContain('ui/astro/mdx')
  })

  it('omits ui layers for angular', () => {
    const ids = resolveLayers(spec({ host: 'angular', ui: null })).map((l) => l.id)
    expect(ids.some((id) => id.startsWith('ui/'))).toBe(false)
  })

  it('orders layers by slot', () => {
    const layers = resolveLayers(spec({ addons: ['tailwind'] }))
    const sorted = [...layers].sort((a, b) => a.slot - b.slot)
    expect(layers).toEqual(sorted)
  })
})
