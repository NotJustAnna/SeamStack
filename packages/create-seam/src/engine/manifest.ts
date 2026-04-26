/**
 * `_layer.json` manifest schema. Each layer dir under `layers/` declares what
 * it contributes to the merged project: deps, scripts, generated-config
 * fragments, and whether it has authored TS source that should be JS-stripped
 * at build time.
 */

export interface ViteConfigFragment {
  imports?: string[]
  plugins?: string[]
  /** Top-level `defineConfig({ ... })` properties as JS expression source. */
  configProps?: Record<string, string>
}

export interface AstroConfigFragment {
  imports?: string[]
  integrations?: string[]
  configProps?: Record<string, string>
}

export interface SeamConfigFragment {
  imports?: string[]
  fabric?: string[]
  configProps?: Record<string, string>
}

export interface AngularConfigFragment {
  /** JSON-Patch-ish: each entry merges into `projects.<projectName>.architect.<X>.options`. */
  buildOptionsPatch?: Record<string, unknown>
  /** Files added to the `assets`/`styles`/`scripts` arrays. */
  buildAssets?: unknown[]
  buildStyles?: unknown[]
  buildScripts?: unknown[]
}

export interface LayerManifest {
  /** Free-text id; informational only. */
  name?: string
  /** Free-text describing the layer; not used by the engine. */
  description?: string
  /** If true, the build step generates a JS sibling for this layer's `files/`. */
  hasJsVariant?: boolean
  /** Merged into root `package.json` `dependencies`. */
  deps?: Record<string, string>
  /** Merged into root `package.json` `devDependencies`. */
  devDeps?: Record<string, string>
  /** Merged into root `package.json` `scripts`. Later layers win. */
  scripts?: Record<string, string>
  /** Merged into root `package.json` `peerDependencies`. */
  peerDeps?: Record<string, string>
  /** Top-level package.json scalar overrides (e.g. `type`). Later layers win. */
  pkgOverrides?: Record<string, unknown>
  /** Contribution to the generated `vite.config.{ts,js}` (only effective on vite host). */
  viteConfig?: ViteConfigFragment
  /** Contribution to the generated `astro.config.mjs` (only effective on astro host). */
  astroConfig?: AstroConfigFragment
  /** Contribution to the generated `seam.config.{ts,js}`. */
  seamConfig?: SeamConfigFragment
  /** Contribution to `angular.json` (only effective on angular host). */
  angularConfig?: AngularConfigFragment
  /** Files in this layer's `files/` are placed under this prefix in the merged project. */
  rootDir?: string
  /** TS-only files; copied only when variant=ts (subdir of layer). Default: `files-ts`. */
  filesTsDir?: string
  /** JS-only files; copied only when variant=js (subdir of layer). Default: `files-js`. */
  filesJsDir?: string
  /** Variant-agnostic files; always copied (subdir of layer). Default: `files`. */
  filesDir?: string
}
