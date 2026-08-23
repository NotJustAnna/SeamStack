import type { Backend, BuildTool, Runtime, Variant } from '../spec.js'
import { defaultRuntimeFor, needsResolvedRuntime } from '../spec.js'
import type { SeamConfigFragment } from '../manifest.js'
import type { RenderedConfig } from './vite-config.js'

const BUILD_STRATEGY_PLACEHOLDER = '{{buildToolRuntimeArgs}}'

export function renderSeamConfig(
  fragments: SeamConfigFragment[],
  variant: Variant,
  buildTool?: BuildTool,
  runtime?: Runtime,
  backend?: Backend,
): RenderedConfig {
  const strategyImports = buildTool ? [`import ${buildTool} from '@seamstack/${buildTool}'`] : []
  const imports = unique([
    "import { defineWeave } from '@seamstack/cli'",
    ...flat(fragments, (f) => f.imports),
    ...strategyImports,
  ]).map((s) => rewriteEntryExtIfJs(s, variant))
  const strategyArgs = buildToolRuntimeArgs(variant, buildTool, runtime, backend)
  const fabric = flat(fragments, (f) => f.fabric)
    .map((s) => s.replace(BUILD_STRATEGY_PLACEHOLDER, strategyArgs))
    .map((s) => rewriteEntryExtIfJs(s, variant))
  const props: Record<string, string> = { port: '4567' }
  for (const f of fragments) {
    if (!f.configProps) continue
    for (const [k, v] of Object.entries(f.configProps)) props[k] = v
  }

  const lines: string[] = []
  lines.push(...imports)
  lines.push('')
  lines.push('export default defineWeave({')
  if (fabric.length > 0) {
    lines.push(`  fabric: [${fabric.join(', ')}],`)
  }
  for (const [k, v] of Object.entries(props)) {
    lines.push(`  ${k}: ${v},`)
  }
  lines.push('})')
  lines.push('')

  return {
    filename: variant === 'ts' ? 'seam.config.ts' : 'seam.config.js',
    source: lines.join('\n'),
  }
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)]
}

function flat<T>(arr: T[], pick: (t: T) => string[] | undefined): string[] {
  const out: string[] = []
  for (const a of arr) {
    const v = pick(a)
    if (v) out.push(...v)
  }
  return unique(out)
}

/**
 * Extra constructor args to splice into a backend's fabric call, e.g. turning
 * `fastify({ entry: '...'{{buildToolRuntimeArgs}} })` into
 * `fastify({ entry: '...', buildTool: esbuild(), runtime: 'bun' })`. `runtime`
 * is normally only emitted when it differs from the variant's zero-config
 * default, to keep the common case free of clutter — except for Hono/Elysia
 * (`needsResolvedRuntime`), where it's always shown: it's not just a cosmetic
 * launcher choice for them, it's which server-binding branch the generated
 * file actually took, worth surfacing even when it happens to be the default.
 *
 * For those same two backends, `devRuntime` is *also* pinned to match
 * `runtime`: the entry file's own code is now hardwired to one engine's API
 * (`Deno.serve`, `Bun.serve`, ...), so `seam dev` — which otherwise defaults
 * `devRuntime` independently via ambient detection — must run it under that
 * same engine, or it crashes calling e.g. `Deno.serve` from a plain Node
 * process. Fastify/Express have no such constraint; `devRuntime` stays free
 * to default independently for them, as designed.
 */
function buildToolRuntimeArgs(
  variant: Variant,
  buildTool: BuildTool | undefined,
  runtime: Runtime | undefined,
  backend: Backend | undefined,
): string {
  const parts: string[] = []
  if (buildTool) parts.push(`buildTool: ${buildTool}()`)
  const pinEngine = backend !== undefined && needsResolvedRuntime(backend)
  if (runtime && (pinEngine || runtime !== defaultRuntimeFor(variant))) {
    parts.push(`runtime: '${runtime}'`)
  }
  if (runtime && pinEngine) parts.push(`devRuntime: '${runtime}'`)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

function rewriteEntryExtIfJs(s: string, variant: 'ts' | 'js'): string {
  if (variant !== 'js') return s
  return s
    .replace(/(['"])(\.\.?\/[^'"]+?)\.tsx(['"])/g, '$1$2.jsx$3')
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts(['"])/g, '$1$2.js$3')
}
