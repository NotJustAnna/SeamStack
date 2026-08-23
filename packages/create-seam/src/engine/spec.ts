export type Host = 'vite' | 'astro' | 'angular'
export type Backend = 'hono' | 'express' | 'fastify' | 'elysia' | 'nestjs'
export type Variant = 'ts' | 'js'
export type Addon = 'tailwind' | 'trpc' | 'graphql' | 'shared'

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
export const ADDONS = ['tailwind', 'trpc', 'graphql', 'shared'] as const satisfies readonly Addon[]

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

/**
 * `variant` is one language for the whole project (frontend + backend) — it can't be
 * split per side. Angular and NestJS only ever emit TypeScript, so picking either
 * already answers the language question; this reports why, so callers can skip
 * asking (or reject a conflicting explicit `js`) instead of silently overriding it.
 */
export function forcedVariantReason(host: Host, backend: Backend): string | undefined {
  if (host === 'angular' && backend === 'nestjs') return 'Angular and NestJS are both TypeScript-only'
  if (host === 'angular') return 'Angular is TypeScript-only'
  if (backend === 'nestjs') return 'NestJS is TypeScript-only'
  return undefined
}
