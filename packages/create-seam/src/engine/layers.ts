import { uiList, type ProjectSpec } from './spec.js'

export interface LayerRef {
  /** Stable id used to look up the layer source dir under `layers/` (slash-separated). */
  id: string
  /** Resolution-order slot; lower runs first, higher overwrites. */
  slot: number
}

const SLOT = {
  base: 0,
  host: 1,
  ui: 2,
  variant: 3,
  backend: 4,
  seamGlue: 5,
  addon: 6,
} as const

export function resolveLayers(spec: ProjectSpec): LayerRef[] {
  const layers: LayerRef[] = []

  layers.push({ id: '_base', slot: SLOT.base })
  layers.push({ id: `host/${spec.host}`, slot: SLOT.host })

  for (const u of uiList(spec)) {
    layers.push({ id: `ui/${spec.host}/${u}`, slot: SLOT.ui })
  }

  layers.push({ id: `variant/${spec.variant}`, slot: SLOT.variant })
  layers.push({ id: `backend/${spec.backend}`, slot: SLOT.backend })
  // Seam-glue runs after host+ui so host-level config additions (e.g. the
  // SeamStack `seam()` plugin in Vite) come after framework UI plugins,
  // matching the canonical [framework(), seam()] convention.
  layers.push({ id: `seam-glue/${spec.host}`, slot: SLOT.seamGlue })

  for (const a of spec.addons) {
    if (a === 'tailwind') {
      layers.push({ id: `addon/tailwind/${spec.host}`, slot: SLOT.addon })
    } else if (a === 'trpc') {
      layers.push({ id: 'addon/trpc/_common', slot: SLOT.addon })
      layers.push({ id: `addon/trpc/client/${spec.host}`, slot: SLOT.addon })
      layers.push({ id: `addon/trpc/server/${spec.backend}`, slot: SLOT.addon })
    } else if (a === 'graphql') {
      layers.push({ id: 'addon/graphql/_common', slot: SLOT.addon })
      layers.push({ id: `addon/graphql/client/${spec.host}`, slot: SLOT.addon })
      layers.push({ id: `addon/graphql/server/${spec.backend}`, slot: SLOT.addon })
    } else if (a === 'shared') {
      layers.push({ id: 'addon/shared/_common', slot: SLOT.addon })
    }
  }

  return layers
}
