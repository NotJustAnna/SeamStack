import type { Backend, Host } from 'create-seam'
import type { MatrixSpec } from './enumerate.js'

export interface BuildExpectations {
  /** Files (relative to project root) that must exist after `seam build`. */
  artifacts: string[]
}

export function buildExpectations(spec: MatrixSpec): BuildExpectations {
  // The seam prod entry is the universal proof of build completion across hosts;
  // it's the wrapper the start command launches. Per-host static/SSR layout
  // diverges enough (vite SPA vs astro static-vs-SSR vs angular) that asserting
  // host-specific files would be brittle without buying any extra coverage —
  // the start-probe + dev-probe afterwards is what actually proves the build is
  // serviceable.
  return { artifacts: ['dist/server/_seam_prod.js'] }
}

export interface PageExpectations {
  /**
   * A CSS selector that, when found rendered in the live page, indicates the UI
   * mounted successfully. For SSR-by-default hosts (astro, angular SSR), the
   * marker is in the initial HTML; for SPA hosts (vite), it's the post-mount DOM.
   */
  marker: string
  /** Optional substring of the *raw response body* (pre-mount) — useful for SSR shells. */
  bodyContains?: string
}

export function pageExpectations(spec: MatrixSpec): PageExpectations {
  if (spec.host === 'angular') {
    return { marker: 'app-root', bodyContains: '<app-root' }
  }
  if (spec.host === 'astro') {
    return { marker: 'body' }
  }
  // vite — selector depends on which UI is mounted (markers verified
  // against the actual layer starter HTML in `layers/ui/vite/<name>/`).
  const ui = typeof spec.ui === 'string' ? spec.ui : null
  switch (ui) {
    case 'react':
    case 'react-swc':
    case 'solid':
      return { marker: '#root', bodyContains: 'id="root"' }
    case 'vue':
    case 'vue-jsx':
    case 'preact':
    case 'svelte':
    case 'vanilla':
      return { marker: '#app', bodyContains: 'id="app"' }
    case 'lit':
      return { marker: 'seam-app', bodyContains: '<seam-app' }
    default:
      return { marker: 'body' }
  }
}

export function expectedApiBody(backend: Backend): { msg: string } {
  return { msg: `hi from ${backend}` }
}

/** Quick sanity for the host before probing the API: angular & nestjs may take longer to be ready. */
export function bootBudgetMs(host: Host): number {
  if (host === 'angular') return 90_000
  if (host === 'astro') return 60_000
  return 45_000
}
