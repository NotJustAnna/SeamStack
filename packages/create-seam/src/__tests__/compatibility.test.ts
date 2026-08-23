import { describe, expect, it } from 'vitest'
import { isAddonCompatible, validateSpec } from '../engine/compatibility.js'
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

describe('validateSpec', () => {
  it('accepts vite + react + ts + hono', () => {
    expect(validateSpec(spec({}))).toEqual([])
  })

  it('rejects vite without a UI', () => {
    expect(validateSpec(spec({ ui: null }))).toEqual([
      expect.objectContaining({ field: 'ui' }),
    ])
  })

  it('rejects multi-UI on vite', () => {
    expect(validateSpec(spec({ ui: ['react', 'vue'] }))).toEqual([
      expect.objectContaining({ field: 'ui' }),
    ])
  })

  it('accepts multi-UI on astro', () => {
    expect(validateSpec(spec({ host: 'astro', ui: ['react', 'mdx'] }))).toEqual([])
  })

  it('rejects unknown ui name', () => {
    expect(validateSpec(spec({ ui: 'angular' }))).toEqual([
      expect.objectContaining({ field: 'ui' }),
    ])
  })

  it('forbids variant=js on angular host', () => {
    expect(validateSpec(spec({ host: 'angular', ui: null, variant: 'js' }))).toEqual([
      expect.objectContaining({ field: 'variant' }),
    ])
  })

  it('forbids variant=js on nestjs backend', () => {
    expect(validateSpec(spec({ backend: 'nestjs', variant: 'js' }))).toEqual([
      expect.objectContaining({ field: 'variant' }),
    ])
  })

  it('rejects ui on angular host', () => {
    expect(validateSpec(spec({ host: 'angular', ui: 'react' }))).toEqual([
      expect.objectContaining({ field: 'ui' }),
    ])
  })

  it('rejects trpc when no compatible UI is selected (vite + lit)', () => {
    expect(validateSpec(spec({ ui: 'lit', addons: ['trpc'] }))).toEqual([
      expect.objectContaining({ field: 'addons' }),
    ])
  })

  it('accepts trpc with vite + react', () => {
    expect(validateSpec(spec({ addons: ['trpc'] }))).toEqual([])
  })

  it('accepts trpc on angular (uses angular trpc client)', () => {
    expect(validateSpec(spec({ host: 'angular', ui: null, addons: ['trpc'] }))).toEqual([])
  })

  it('accepts trpc with astro + react', () => {
    expect(validateSpec(spec({ host: 'astro', ui: ['react', 'mdx'], addons: ['trpc'] }))).toEqual(
      [],
    )
  })

  it('rejects trpc with astro + only mdx', () => {
    expect(validateSpec(spec({ host: 'astro', ui: ['mdx'], addons: ['trpc'] }))).toEqual([
      expect.objectContaining({ field: 'addons' }),
    ])
  })

  it('flags duplicate addons', () => {
    expect(validateSpec(spec({ addons: ['tailwind', 'tailwind'] }))).toEqual([
      expect.objectContaining({ field: 'addons' }),
    ])
  })

  it('rejects tsc buildTool on a js project', () => {
    expect(validateSpec(spec({ variant: 'js', buildTool: 'tsc' }))).toEqual([
      expect.objectContaining({ field: 'buildTool' }),
    ])
  })

  it('accepts a bundler buildTool on a js project', () => {
    expect(validateSpec(spec({ variant: 'js', buildTool: 'esbuild' }))).toEqual([])
  })

  it('rejects buildTool on nestjs', () => {
    expect(validateSpec(spec({ backend: 'nestjs', buildTool: 'tsc' }))).toEqual([
      expect.objectContaining({ field: 'buildTool' }),
    ])
  })

  it('rejects runtime on nestjs', () => {
    expect(validateSpec(spec({ backend: 'nestjs', runtime: 'bun' }))).toEqual([
      expect.objectContaining({ field: 'runtime' }),
    ])
  })

  it('rejects runtime=node on a ts project with no buildTool (cannot run raw .ts)', () => {
    expect(validateSpec(spec({ variant: 'ts', runtime: 'node' }))).toEqual([
      expect.objectContaining({ field: 'runtime' }),
    ])
  })

  it('accepts runtime=nub on a ts project with no buildTool (nub runs TS directly)', () => {
    expect(validateSpec(spec({ variant: 'ts', runtime: 'nub' }))).toEqual([])
  })

  it('accepts runtime=node on a ts project when a buildTool compiles it first', () => {
    expect(validateSpec(spec({ variant: 'ts', runtime: 'node', buildTool: 'esbuild' }))).toEqual([])
  })
})

describe('isAddonCompatible', () => {
  it('tailwind is universally compatible', () => {
    expect(isAddonCompatible(spec({}), 'tailwind')).toBe(true)
    expect(isAddonCompatible(spec({ host: 'angular', ui: null }), 'tailwind')).toBe(true)
    expect(isAddonCompatible(spec({ host: 'astro', ui: ['mdx'] }), 'tailwind')).toBe(true)
  })

  it('graphql is universally compatible', () => {
    expect(isAddonCompatible(spec({ ui: 'lit' }), 'graphql')).toBe(true)
    expect(isAddonCompatible(spec({ host: 'angular', ui: null }), 'graphql')).toBe(true)
  })

  it('trpc requires a supported UI client', () => {
    expect(isAddonCompatible(spec({ ui: 'lit' }), 'trpc')).toBe(false)
    expect(isAddonCompatible(spec({ ui: 'vanilla' }), 'trpc')).toBe(false)
    expect(isAddonCompatible(spec({ ui: 'react' }), 'trpc')).toBe(true)
  })

  it('shared is compatible with vite and astro but not angular', () => {
    expect(isAddonCompatible(spec({}), 'shared')).toBe(true)
    expect(isAddonCompatible(spec({ host: 'astro', ui: ['react'] }), 'shared')).toBe(true)
    expect(isAddonCompatible(spec({ host: 'angular', ui: null }), 'shared')).toBe(false)
  })
})
