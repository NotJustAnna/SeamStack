import type { ViteConfigFragment } from '../manifest.js'

export interface RenderedConfig {
  filename: string
  source: string
}

export function renderViteConfig(
  fragments: ViteConfigFragment[],
  variant: 'ts' | 'js',
): RenderedConfig {
  const imports = unique(['import { defineConfig } from \'vite\'', ...flat(fragments, (f) => f.imports)])
  const plugins = flat(fragments, (f) => f.plugins)
  const props: Record<string, string> = {}
  for (const f of fragments) {
    if (!f.configProps) continue
    for (const [k, v] of Object.entries(f.configProps)) props[k] = v
  }

  const lines: string[] = []
  lines.push(...imports)
  lines.push('')
  lines.push('export default defineConfig({')
  if (plugins.length > 0) {
    lines.push(`  plugins: [${plugins.join(', ')}],`)
  }
  for (const [k, v] of Object.entries(props)) {
    lines.push(`  ${k}: ${v},`)
  }
  lines.push('})')
  lines.push('')

  return {
    filename: variant === 'ts' ? 'vite.config.ts' : 'vite.config.js',
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
