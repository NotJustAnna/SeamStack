import type { SeamConfigFragment } from '../manifest.js'
import type { RenderedConfig } from './vite-config.js'

export function renderSeamConfig(
  fragments: SeamConfigFragment[],
  variant: 'ts' | 'js',
): RenderedConfig {
  const imports = unique([
    "import { defineWeave } from '@seamstack/cli'",
    ...flat(fragments, (f) => f.imports),
  ]).map((s) => rewriteEntryExtIfJs(s, variant))
  const fabric = flat(fragments, (f) => f.fabric).map((s) => rewriteEntryExtIfJs(s, variant))
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

function rewriteEntryExtIfJs(s: string, variant: 'ts' | 'js'): string {
  if (variant !== 'js') return s
  return s
    .replace(/(['"])(\.\.?\/[^'"]+?)\.tsx(['"])/g, '$1$2.jsx$3')
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts(['"])/g, '$1$2.js$3')
}
