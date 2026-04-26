export type Host = 'vite' | 'astro' | 'angular'
export type Backend = 'hono' | 'express' | 'fastify' | 'elysia' | 'nestjs'
export type Variant = 'ts' | 'js'
export type Addon = 'tailwind' | 'trpc' | 'graphql'

export type ViteUi =
  | 'vanilla'
  | 'vue'
  | 'vue-jsx'
  | 'react'
  | 'react-swc'
  | 'preact'
  | 'svelte'
  | 'solid'
  | 'lit'

export type AstroUi = 'react' | 'vue' | 'svelte' | 'preact' | 'mdx' | 'alpine'

export const HOSTS = ['vite', 'astro', 'angular'] as const satisfies readonly Host[]
export const BACKENDS = [
  'hono',
  'express',
  'fastify',
  'elysia',
  'nestjs',
] as const satisfies readonly Backend[]
export const VARIANTS = ['ts', 'js'] as const satisfies readonly Variant[]
export const ADDONS = ['tailwind', 'trpc', 'graphql'] as const satisfies readonly Addon[]

export const VITE_UIS = [
  'vanilla',
  'vue',
  'vue-jsx',
  'react',
  'react-swc',
  'preact',
  'svelte',
  'solid',
  'lit',
] as const satisfies readonly ViteUi[]

export const ASTRO_UIS = [
  'react',
  'vue',
  'svelte',
  'preact',
  'mdx',
  'alpine',
] as const satisfies readonly AstroUi[]

export interface ProjectSpec {
  name: string
  host: Host
  ui: string | string[] | null
  variant: Variant
  backend: Backend
  addons: Addon[]
}

export function isViteUi(v: string): v is ViteUi {
  return (VITE_UIS as readonly string[]).includes(v)
}

export function isAstroUi(v: string): v is AstroUi {
  return (ASTRO_UIS as readonly string[]).includes(v)
}

export function uiList(spec: Pick<ProjectSpec, 'ui'>): string[] {
  if (spec.ui == null) return []
  return Array.isArray(spec.ui) ? spec.ui : [spec.ui]
}
