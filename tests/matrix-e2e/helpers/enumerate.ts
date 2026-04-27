import { validateSpec, type Addon, type Backend, type ProjectSpec } from 'create-seam'

export interface MatrixSpec extends ProjectSpec {
  comboId: string
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7
}

const BACKENDS_TS_ALL: Backend[] = ['hono', 'express', 'fastify', 'elysia', 'nestjs']
const BACKENDS_NON_HONO_VITE_ADDON: Backend[] = ['express', 'fastify', 'elysia', 'nestjs']

const VITE_UI_SWEEP = ['vanilla', 'vue', 'vue-jsx', 'react-swc', 'preact', 'svelte', 'solid', 'lit'] as const
const ASTRO_UI_SWEEP = ['react', 'vue', 'svelte', 'preact', 'mdx', 'alpine'] as const

function id(spec: ProjectSpec): string {
  const ui = spec.ui == null ? 'none' : Array.isArray(spec.ui) ? (spec.ui.length === 0 ? 'none' : spec.ui.join('+')) : spec.ui
  const addons = spec.addons.length === 0 ? 'noaddon' : spec.addons.join('+')
  return `${spec.host}-${spec.backend}-${ui}-${spec.variant}-${addons}`
}

function mk(
  tier: MatrixSpec['tier'],
  partial: Omit<ProjectSpec, 'name'> & { name?: string },
): MatrixSpec {
  const spec: ProjectSpec = {
    name: partial.name ?? 'app',
    host: partial.host,
    ui: partial.ui,
    variant: partial.variant,
    backend: partial.backend,
    addons: partial.addons,
  }
  return { ...spec, comboId: id(spec), tier }
}

export function enumerateSpecs(): MatrixSpec[] {
  const out: MatrixSpec[] = []

  // Tier 1: Host × Backend baseline (15)
  for (const b of BACKENDS_TS_ALL) {
    out.push(mk(1, { host: 'vite', ui: 'react', variant: 'ts', backend: b, addons: [] }))
  }
  for (const b of BACKENDS_TS_ALL) {
    out.push(mk(1, { host: 'astro', ui: null, variant: 'ts', backend: b, addons: [] }))
  }
  for (const b of BACKENDS_TS_ALL) {
    out.push(mk(1, { host: 'angular', ui: null, variant: 'ts', backend: b, addons: [] }))
  }

  // Tier 2: UI sweep (15)
  for (const u of VITE_UI_SWEEP) {
    out.push(mk(2, { host: 'vite', ui: u, variant: 'ts', backend: 'hono', addons: [] }))
  }
  for (const u of ASTRO_UI_SWEEP) {
    out.push(mk(2, { host: 'astro', ui: u, variant: 'ts', backend: 'hono', addons: [] }))
  }

  // Tier 3: JS variant (2)
  out.push(mk(3, { host: 'vite', ui: 'react', variant: 'js', backend: 'hono', addons: [] }))
  out.push(mk(3, { host: 'astro', ui: 'react', variant: 'js', backend: 'hono', addons: [] }))

  // Tier 4: Addon × Host (9)
  const addonsForT4: Addon[] = ['tailwind', 'trpc', 'graphql']
  for (const a of addonsForT4) {
    out.push(mk(4, { host: 'vite', ui: 'react', variant: 'ts', backend: 'hono', addons: [a] }))
    out.push(mk(4, { host: 'astro', ui: 'react', variant: 'ts', backend: 'hono', addons: [a] }))
    out.push(mk(4, { host: 'angular', ui: null, variant: 'ts', backend: 'hono', addons: [a] }))
  }

  // Tier 5: Addon × Backend (8)
  for (const b of BACKENDS_NON_HONO_VITE_ADDON) {
    out.push(mk(5, { host: 'vite', ui: 'react', variant: 'ts', backend: b, addons: ['trpc'] }))
  }
  for (const b of BACKENDS_NON_HONO_VITE_ADDON) {
    out.push(mk(5, { host: 'vite', ui: 'react', variant: 'ts', backend: b, addons: ['graphql'] }))
  }

  // Tier 6: Kitchen sink per host (3)
  out.push(mk(6, { host: 'vite', ui: 'react', variant: 'ts', backend: 'hono', addons: ['tailwind', 'trpc', 'graphql'] }))
  out.push(mk(6, { host: 'astro', ui: 'react', variant: 'ts', backend: 'hono', addons: ['tailwind', 'trpc', 'graphql'] }))
  out.push(mk(6, { host: 'angular', ui: null, variant: 'ts', backend: 'hono', addons: ['tailwind', 'trpc', 'graphql'] }))

  // Tier 7: Astro spice (1)
  out.push(mk(7, { host: 'astro', ui: null, variant: 'ts', backend: 'elysia', addons: ['tailwind'] }))

  return out
}

/** Throws if any enumerated spec violates compatibility rules — sanity for the static list. */
export function assertEnumerationValid(): MatrixSpec[] {
  const specs = enumerateSpecs()
  const ids = new Set<string>()
  for (const s of specs) {
    if (ids.has(s.comboId)) {
      throw new Error(`Duplicate comboId in enumeration: ${s.comboId}`)
    }
    ids.add(s.comboId)
    const errors = validateSpec(s)
    if (errors.length > 0) {
      throw new Error(`Invalid enumerated spec ${s.comboId}: ${errors.map((e) => e.message).join('; ')}`)
    }
  }
  return specs
}

export function applyFilters(specs: MatrixSpec[]): MatrixSpec[] {
  let out = specs
  const filter = process.env.MATRIX_FILTER
  if (filter) {
    const re = new RegExp(filter)
    out = out.filter((s) => re.test(s.comboId))
  }
  const shard = process.env.MATRIX_SHARD
  if (shard) {
    const m = /^(\d+)\/(\d+)$/.exec(shard)
    if (!m) throw new Error(`MATRIX_SHARD must look like '1/4'; got ${shard}`)
    const idx = Number(m[1]) - 1
    const total = Number(m[2])
    out = out.filter((_, i) => i % total === idx)
  }
  return out
}
