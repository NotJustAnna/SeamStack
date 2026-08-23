import type { Addon, AstroUi, Backend, BuildTool, Host, Runtime, ViteUi } from './spec.js'

export const HOST_LABEL: Record<Host, string> = {
  vite: 'Vite',
  astro: 'Astro',
  angular: 'Angular',
}

export const HOST_HINT: Record<Host, string> = {
  vite: 'fastest dev server, any UI framework',
  astro: 'islands architecture, optional UI integrations, MDX',
  angular: 'opinionated, batteries included',
}

export const BACKEND_LABEL: Record<Backend, string> = {
  hono: 'Hono',
  express: 'Express',
  fastify: 'Fastify',
  elysia: 'Elysia',
  nestjs: 'NestJS',
}

export const VITE_UI_LABEL: Record<ViteUi, string> = {
  vanilla: 'Vanilla',
  vue: 'Vue',
  'vue-jsx': 'Vue (JSX)',
  react: 'React',
  'react-swc': 'React (SWC)',
  preact: 'Preact',
  svelte: 'Svelte',
  solid: 'Solid',
  lit: 'Lit',
}

export const ASTRO_UI_LABEL: Record<AstroUi, string> = {
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  preact: 'Preact',
  mdx: 'MDX',
  alpine: 'Alpine.js',
}

export const ADDON_LABEL: Record<Addon, string> = {
  tailwind: 'Tailwind CSS v4',
  trpc: 'tRPC starter',
  graphql: 'GraphQL starter',
  shared: 'Shared folder',
}

export const ADDON_HINT: Record<Addon, string> = {
  tailwind: 'utility-first CSS, framework-aware install',
  trpc: 'end-to-end typesafe API, router + typed client',
  graphql: 'GraphQL endpoint with idiomatic backend plugin',
  shared: 'shared/ folder with types and utilities usable by both client and server',
}

export const BUILD_STRATEGY_LABEL: Record<'none' | 'bundle' | 'compile', string> = {
  none: 'No build',
  bundle: 'Bundle for deployment',
  compile: 'Compile 1:1',
}

export const BUILD_STRATEGY_HINT: Record<'none' | 'bundle' | 'compile', string> = {
  none: 'run the source directly, no build step',
  bundle: 'single-file output, good for Lambda/containers',
  compile: 'keep file structure, still lets you deploy compiled JS',
}

export const BUILD_TOOL_LABEL: Record<BuildTool, string> = {
  esbuild: 'esbuild',
  rollup: 'Rollup',
  rolldown: 'Rolldown',
  webpack: 'webpack',
  tsc: 'tsc',
  swc: 'SWC',
  oxc: 'oxc',
}

export const BUILD_TOOL_HINT: Record<BuildTool, string> = {
  esbuild: 'fast, popular, minimal config',
  rollup: 'mature, plugin ecosystem',
  rolldown: 'Rust-based, Rollup-compatible, very fast',
  webpack: 'battle-tested, most configurable',
  tsc: "TypeScript's own compiler — slower, most standards-faithful",
  swc: 'Rust-based, very fast, transpile-only',
  oxc: 'Rust-based, newest, very fast, transpile-only',
}

export const RUNTIME_LABEL: Record<Runtime, string> = {
  tsx: 'tsx',
  node: 'Node',
  bun: 'Bun',
  nub: 'nub',
  deno: 'Deno',
}

export const RUNTIME_HINT: Record<Runtime, string> = {
  tsx: 'runs TS directly on Node',
  node: 'plain Node — JS only, no TS support',
  bun: "Bun's own engine — runs TS directly",
  nub: 'Node wrapper that runs TS directly',
  deno: "Deno's own engine — runs TS directly",
}
