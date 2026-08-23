import type { BuildTool, Runtime, Variant } from '../spec.js'
import { defaultRuntimeFor } from '../spec.js'
import type { SeamConfigFragment } from '../manifest.js'
import type { RenderedConfig } from './vite-config.js'

const BUILD_STRATEGY_PLACEHOLDER = '{{buildToolRuntimeArgs}}'

export function renderSeamConfig(
  fragments: SeamConfigFragment[],
  variant: Variant,
  buildTool?: BuildTool,
  runtime?: Runtime,
): RenderedConfig {
  const strategyImports = buildTool ? [`import ${buildTool} from '@seamstack/${buildTool}'`] : []
  const imports = unique([
    "import { defineWeave } from '@seamstack/cli'",
    ...flat(fragments, (f) => f.imports),
    ...strategyImports,
  ]).map((s) => rewriteEntryExtIfJs(s, variant))
  const strategyArgs = buildToolRuntimeArgs(variant, buildTool, runtime)
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
 * is only emitted when it differs from the variant's zero-config default, to
 * keep the common case free of clutter.
 */
function buildToolRuntimeArgs(variant: Variant, buildTool: BuildTool | undefined, runtime: Runtime | undefined): string {
  const parts: string[] = []
  if (buildTool) parts.push(`buildTool: ${buildTool}()`)
  if (runtime && runtime !== defaultRuntimeFor(variant)) parts.push(`runtime: '${runtime}'`)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

function rewriteEntryExtIfJs(s: string, variant: 'ts' | 'js'): string {
  if (variant !== 'js') return s
  return s
    .replace(/(['"])(\.\.?\/[^'"]+?)\.tsx(['"])/g, '$1$2.jsx$3')
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts(['"])/g, '$1$2.js$3')
}
