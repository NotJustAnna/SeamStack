import type { AstroConfigFragment } from '../manifest.js'
import type { RenderedConfig } from './vite-config.js'

export function renderAstroConfig(fragments: AstroConfigFragment[]): RenderedConfig {
  const imports = unique([
    "import { defineConfig } from 'astro/config'",
    ...flat(fragments, (f) => f.imports),
  ])
  const integrations = flat(fragments, (f) => f.integrations)
  const props: Record<string, string> = {}
  for (const f of fragments) {
    if (!f.configProps) continue
    for (const [k, v] of Object.entries(f.configProps)) props[k] = v
  }

  const lines: string[] = []
  lines.push(...imports)
  lines.push('')
  lines.push('export default defineConfig({')
  if (integrations.length > 0) {
    lines.push(`  integrations: [${integrations.join(', ')}],`)
  }
  for (const [k, v] of Object.entries(props)) {
    lines.push(`  ${k}: ${v},`)
  }
  lines.push('})')
  lines.push('')

  return { filename: 'astro.config.mjs', source: lines.join('\n') }
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
