export type Host = 'vite' | 'astro' | 'angular'
export type Backend = 'hono' | 'express' | 'fastify' | 'elysia' | 'nestjs'
export type Variant = 'ts' | 'js'
export type Addon = 'tailwind' | 'trpc' | 'graphql' | 'shared'
export type BuildTool = 'esbuild' | 'rollup' | 'rolldown' | 'webpack' | 'tsc' | 'swc' | 'oxc'
export type Runtime = 'tsx' | 'node' | 'bun' | 'nub' | 'deno'
/** Prompt-flow concept only — never persisted on `ProjectSpec`; derived back from `buildTool`. */
export type BuildStrategy = 'none' | 'bundle' | 'compile'
/** Which HTTP-server binding a generated backend entry needs — not every `Runtime` is its own engine. */
export type Engine = 'node' | 'bun' | 'deno'

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
export const BUILD_TOOLS = [
  'esbuild',
  'rollup',
  'rolldown',
  'webpack',
  'tsc',
  'swc',
  'oxc',
] as const satisfies readonly BuildTool[]
export const RUNTIMES = ['tsx', 'node', 'bun', 'nub', 'deno'] as const satisfies readonly Runtime[]

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
  buildTool?: BuildTool
  runtime?: Runtime
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

/**
 * NestJS manages its own build/run pipeline (`nest build`/`nest start`) — the
 * `buildTool`/`runtime` question this module answers for every other backend
 * doesn't apply to it at all, not even as a default.
 */
export function forcedNoBuildStrategyReason(backend: Backend): string | undefined {
  return backend === 'nestjs' ? 'NestJS manages its own build via `nest build`/`nest start`' : undefined
}

/** The zero-config runtime for a variant with no explicit `runtime` and no `buildTool`. */
export function defaultRuntimeFor(variant: Variant): Runtime {
  return variant === 'ts' ? 'tsx' : 'node'
}

/**
 * Backends we're not confident support a given runtime — kept out of the
 * *interactive* menu as a caution, but never hard-rejected by validateSpec:
 * this is contested/unverified data (e.g. a documented Fastify+Deno
 * incompatibility that a basic smoke test didn't reproduce), not a confirmed
 * crash. An explicit `--runtime` flag still works.
 */
const RUNTIME_CAUTION: Partial<Record<Backend, Partial<Record<Runtime, true>>>> = {
  fastify: { deno: true },
}

/**
 * Curates the *interactive* runtime menu for the "no build" strategy — plain
 * `node` can't execute a raw `.ts` entry (unlike `nub`, which despite the
 * name is its own TS-capable engine, same as `bun`/`deno`), so it's left off
 * the ts menu. `tsx` is left off the js menu since it adds a dependency for
 * no benefit on plain JS. Also drops any runtime flagged in `RUNTIME_CAUTION`
 * for this backend. Doesn't restrict what `--runtime` accepts via CLI flags —
 * see `validateBuildStrategy` for the one combo that's actually broken.
 */
export function runtimeOptionsFor(variant: Variant, backend: Backend): Runtime[] {
  const base = variant === 'ts' ? (['tsx', 'bun', 'nub', 'deno'] as const) : (['node', 'bun', 'nub', 'deno'] as const)
  const caution = RUNTIME_CAUTION[backend]
  return caution ? base.filter((r) => !caution[r]) : [...base]
}

/**
 * Fastify/Express are Node-only frameworks — `runtime` for them is just
 * "which binary launches this file," fine to leave unset for a compiled
 * build (see `defaultCompiledRunner` in `@seamstack/core`). Hono/Elysia have
 * genuine per-engine server-binding APIs (`@hono/node-server` vs `Bun.serve`
 * vs `Deno.serve`; `@elysiajs/node`'s adapter vs bare `.listen()` vs
 * `Deno.serve`) that must be picked at scaffold time, so their `runtime`
 * can never be left unresolved.
 */
export function needsResolvedRuntime(backend: Backend): boolean {
  return backend === 'hono' || backend === 'elysia'
}

/** tsx/node/nub are all "the Node engine family" as far as server-binding code is concerned. */
export function engineFor(runtime: Runtime): Engine {
  return runtime === 'bun' ? 'bun' : runtime === 'deno' ? 'deno' : 'node'
}
