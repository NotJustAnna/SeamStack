import Handlebars from 'handlebars'
import { stripTypes } from './strip-types.js'
import { uiList, type ProjectSpec } from './spec.js'

/**
 * Context exposed to `.hbs` templates. Pre-computed booleans keep
 * templates readable: `{{#if hasTrpc}}` instead of helper invocations.
 */
export interface TemplateContext {
  readonly name: string
  readonly host: string
  readonly ui: readonly string[]
  readonly variant: 'ts' | 'js'
  readonly backend: string
  readonly addons: readonly string[]
  // host kind
  readonly isVite: boolean
  readonly isAstro: boolean
  readonly isAngular: boolean
  // language
  readonly isTs: boolean
  readonly isJs: boolean
  // addons
  readonly hasTrpc: boolean
  readonly hasGraphql: boolean
  readonly hasTailwind: boolean
  // ui presence (folded across react/react-swc and vue/vue-jsx)
  readonly hasReact: boolean
  readonly hasPreact: boolean
  readonly hasVue: boolean
  readonly hasSvelte: boolean
  readonly hasSolid: boolean
  readonly hasLit: boolean
  readonly hasMdx: boolean
  readonly hasAlpine: boolean
  readonly hasVanilla: boolean
}

export function buildTemplateContext(spec: ProjectSpec): TemplateContext {
  const ui = uiList(spec)
  return {
    name: spec.name,
    host: spec.host,
    ui,
    variant: spec.variant,
    backend: spec.backend,
    addons: spec.addons,
    isVite: spec.host === 'vite',
    isAstro: spec.host === 'astro',
    isAngular: spec.host === 'angular',
    isTs: spec.variant === 'ts',
    isJs: spec.variant === 'js',
    hasTrpc: spec.addons.includes('trpc'),
    hasGraphql: spec.addons.includes('graphql'),
    hasTailwind: spec.addons.includes('tailwind'),
    hasReact: ui.includes('react') || ui.includes('react-swc'),
    hasPreact: ui.includes('preact'),
    hasVue: ui.includes('vue') || ui.includes('vue-jsx'),
    hasSvelte: ui.includes('svelte'),
    hasSolid: ui.includes('solid'),
    hasLit: ui.includes('lit'),
    hasMdx: ui.includes('mdx'),
    hasAlpine: ui.includes('alpine'),
    hasVanilla: ui.includes('vanilla'),
  }
}

const handlebars = Handlebars.create()
handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b)
handlebars.registerHelper('includes', (arr: unknown, v: unknown) =>
  Array.isArray(arr) && arr.includes(v as never),
)

export function renderTemplate(source: string, context: TemplateContext): string {
  const tpl = handlebars.compile(source, { noEscape: true })
  return tpl(context)
}

/**
 * Resolves the output filename for a `.hbs` template:
 *   - strips the trailing `.hbs`
 *   - when `isJs`, also rewrites `.tsx` → `.jsx` and `.ts` → `.js`
 *
 * Returns the same filename unchanged if it doesn't end in `.hbs`.
 */
export function templateOutputName(filename: string, isJs: boolean): string {
  if (!filename.endsWith('.hbs')) return filename
  const base = filename.slice(0, -'.hbs'.length)
  if (!isJs) return base
  if (base.endsWith('.tsx')) return base.slice(0, -'.tsx'.length) + '.jsx'
  if (base.endsWith('.ts')) return base.slice(0, -'.ts'.length) + '.js'
  return base
}

/**
 * Renders a `.hbs` template, applying type-stripping for the JS variant when
 * the underlying file is `.ts`/`.tsx`.
 */
export function renderHbsFile(
  filename: string,
  source: string,
  context: TemplateContext,
): { name: string; content: string } {
  const name = templateOutputName(filename, context.isJs)
  let content = renderTemplate(source, context)
  if (context.isJs && /\.(tsx?)\.hbs$/.test(filename)) {
    content = stripTypes(content)
  }
  return { name, content }
}
