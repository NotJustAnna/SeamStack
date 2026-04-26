import type { Addon, AstroUi, Backend, Host, ViteUi } from './spec.js'

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
}

export const ADDON_HINT: Record<Addon, string> = {
  tailwind: 'utility-first CSS, framework-aware install',
  trpc: 'end-to-end typesafe API, router + typed client',
  graphql: 'GraphQL endpoint with idiomatic backend plugin',
}
