export {
  detectPackageManager,
  isDirNonEmpty,
  scaffold,
  type PackageManager,
  type ScaffoldInput,
} from './scaffold.js'
export { composeProject, type ComposeOptions, type ComposeResult } from './engine/index.js'
export {
  ADDONS,
  ASTRO_UIS,
  BACKENDS,
  HOSTS,
  VARIANTS,
  VITE_UIS,
  isAstroUi,
  isViteUi,
  uiList,
  type Addon,
  type AstroUi,
  type Backend,
  type Host,
  type ProjectSpec,
  type Variant,
  type ViteUi,
} from './engine/spec.js'
export { resolveLayers, type LayerRef } from './engine/layers.js'
export { validateSpec, isAddonCompatible, type CompatError } from './engine/compatibility.js'
