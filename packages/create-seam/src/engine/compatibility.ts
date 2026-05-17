import {
  ASTRO_UIS,
  VITE_UIS,
  isAstroUi,
  isViteUi,
  uiList,
  type Addon,
  type Host,
  type ProjectSpec,
} from './spec.js'

export interface CompatError {
  field: 'ui' | 'variant' | 'addons'
  message: string
}

export function validateSpec(spec: ProjectSpec): CompatError[] {
  const errors: CompatError[] = []

  errors.push(...validateUi(spec))
  errors.push(...validateVariant(spec))
  errors.push(...validateAddons(spec))

  return errors
}

function validateUi(spec: ProjectSpec): CompatError[] {
  if (spec.host === 'angular') {
    if (spec.ui != null && uiList(spec).length > 0) {
      return [{ field: 'ui', message: 'Angular does not take a separate UI choice; omit --ui.' }]
    }
    return []
  }

  if (spec.host === 'vite') {
    const uis = uiList(spec)
    if (uis.length === 0) {
      return [{ field: 'ui', message: 'Vite requires exactly one --ui (one of: ' + VITE_UIS.join(', ') + ').' }]
    }
    if (uis.length > 1) {
      return [{ field: 'ui', message: 'Vite accepts a single UI; got ' + uis.length + '.' }]
    }
    if (!isViteUi(uis[0]!)) {
      return [{ field: 'ui', message: `Unknown Vite UI: ${uis[0]} (one of: ${VITE_UIS.join(', ')}).` }]
    }
    return []
  }

  if (spec.host === 'astro') {
    const uis = uiList(spec)
    const errs: CompatError[] = []
    for (const u of uis) {
      if (!isAstroUi(u)) {
        errs.push({ field: 'ui', message: `Unknown Astro UI: ${u} (one of: ${ASTRO_UIS.join(', ')}).` })
      }
    }
    const seen = new Set<string>()
    for (const u of uis) {
      if (seen.has(u)) errs.push({ field: 'ui', message: `Duplicate Astro UI: ${u}.` })
      seen.add(u)
    }
    return errs
  }

  return []
}

function validateVariant(spec: ProjectSpec): CompatError[] {
  if (spec.host === 'angular' && spec.variant === 'js') {
    return [{ field: 'variant', message: 'Angular projects are TypeScript-only.' }]
  }
  if (spec.backend === 'nestjs' && spec.variant === 'js') {
    return [{ field: 'variant', message: 'NestJS backend is TypeScript-only.' }]
  }
  return []
}

const TRPC_FRONT_OK: Record<Host, ReadonlySet<string>> = {
  vite: new Set<string>(['react', 'react-swc', 'vue', 'vue-jsx', 'svelte', 'solid', 'preact']),
  astro: new Set<string>(['react', 'vue', 'svelte', 'preact']),
  angular: new Set<string>(['__angular__']),
}

function validateAddons(spec: ProjectSpec): CompatError[] {
  const errs: CompatError[] = []
  const seen = new Set<Addon>()
  for (const a of spec.addons) {
    if (seen.has(a)) errs.push({ field: 'addons', message: `Duplicate addon: ${a}.` })
    seen.add(a)
  }
  if (spec.addons.includes('trpc')) errs.push(...checkTrpc(spec))
  if (spec.addons.includes('shared') && spec.host === 'angular') {
    errs.push({ field: 'addons', message: 'The shared/ addon is not supported for Angular projects.' })
  }
  return errs
}

function checkTrpc(spec: ProjectSpec): CompatError[] {
  if (spec.host === 'angular') return []
  const uis = uiList(spec)
  const allowed = TRPC_FRONT_OK[spec.host]
  const ok = uis.some((u) => allowed.has(u))
  if (!ok) {
    return [
      {
        field: 'addons',
        message: `tRPC needs a UI client supported on ${spec.host} (one of: ${[...allowed].join(', ')}); selected: ${uis.join(', ') || '(none)'}.`,
      },
    ]
  }
  return []
}

export function isAddonCompatible(spec: ProjectSpec, addon: Addon): boolean {
  return validateAddons({ ...spec, addons: [addon] }).length === 0
}
