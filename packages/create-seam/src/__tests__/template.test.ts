import { describe, expect, it } from 'vitest'
import {
  buildTemplateContext,
  renderHbsFile,
  renderTemplate,
  templateOutputName,
} from '../engine/template.js'
import type { ProjectSpec } from '../engine/spec.js'

const baseSpec: ProjectSpec = {
  name: 'demo',
  host: 'vite',
  ui: 'react',
  variant: 'ts',
  backend: 'hono',
  addons: [],
}

describe('buildTemplateContext', () => {
  it('derives host/variant booleans', () => {
    const ctx = buildTemplateContext(baseSpec)
    expect(ctx.isVite).toBe(true)
    expect(ctx.isAstro).toBe(false)
    expect(ctx.isAngular).toBe(false)
    expect(ctx.isTs).toBe(true)
    expect(ctx.isJs).toBe(false)
  })

  it('flags addons as booleans', () => {
    const ctx = buildTemplateContext({ ...baseSpec, addons: ['trpc', 'tailwind'] })
    expect(ctx.hasTrpc).toBe(true)
    expect(ctx.hasTailwind).toBe(true)
    expect(ctx.hasGraphql).toBe(false)
  })

  it('folds react/react-swc and vue/vue-jsx into hasReact / hasVue', () => {
    const a = buildTemplateContext({ ...baseSpec, ui: 'react-swc' })
    expect(a.hasReact).toBe(true)
    const b = buildTemplateContext({ ...baseSpec, ui: 'vue-jsx' })
    expect(b.hasVue).toBe(true)
  })

  it('handles astro multi-UI arrays', () => {
    const ctx = buildTemplateContext({
      ...baseSpec,
      host: 'astro',
      ui: ['react', 'mdx'],
    })
    expect(ctx.hasReact).toBe(true)
    expect(ctx.hasMdx).toBe(true)
    expect(ctx.hasVue).toBe(false)
  })
})

describe('renderTemplate', () => {
  it('renders simple conditionals', () => {
    const ctx = buildTemplateContext({ ...baseSpec, addons: ['trpc'] })
    const out = renderTemplate('{{#if hasTrpc}}yes{{else}}no{{/if}}', ctx)
    expect(out).toBe('yes')
  })

  it('does not html-escape (noEscape mode)', () => {
    const ctx = buildTemplateContext(baseSpec)
    const out = renderTemplate("<div title='{{name}}'>{{name}}</div>", {
      ...ctx,
      name: 'A & B',
    })
    expect(out).toBe("<div title='A & B'>A & B</div>")
  })

  it('passes through Handlebars escape `\\{{`', () => {
    const ctx = buildTemplateContext(baseSpec)
    const out = renderTemplate('style=\\{{ a: 1 }}', ctx)
    expect(out).toBe('style={{ a: 1 }}')
  })
})

describe('templateOutputName', () => {
  it('strips .hbs', () => {
    expect(templateOutputName('main.tsx.hbs', false)).toBe('main.tsx')
    expect(templateOutputName('App.vue.hbs', false)).toBe('App.vue')
    expect(templateOutputName('index.html.hbs', false)).toBe('index.html')
  })

  it('rewrites .tsx → .jsx and .ts → .js for the JS variant', () => {
    expect(templateOutputName('main.tsx.hbs', true)).toBe('main.jsx')
    expect(templateOutputName('main.ts.hbs', true)).toBe('main.js')
  })

  it('leaves non-TS extensions alone in JS variant', () => {
    expect(templateOutputName('App.vue.hbs', true)).toBe('App.vue')
    expect(templateOutputName('index.html.hbs', true)).toBe('index.html')
  })

  it('returns input unchanged when not a .hbs file', () => {
    expect(templateOutputName('static.css', false)).toBe('static.css')
  })
})

describe('renderHbsFile', () => {
  it('strips types when isJs and source is .ts/.tsx', () => {
    const ctx = buildTemplateContext({ ...baseSpec, variant: 'js' })
    const result = renderHbsFile(
      'demo.tsx.hbs',
      'useState<string>("{{name}}")\n',
      ctx,
    )
    expect(result.name).toBe('demo.jsx')
    expect(result.content).toBe('useState("demo")\n')
  })

  it('does not strip types for non-TS templates', () => {
    const ctx = buildTemplateContext({ ...baseSpec, variant: 'js' })
    const result = renderHbsFile('App.vue.hbs', '<p>{{name}}</p>', ctx)
    expect(result.name).toBe('App.vue')
    expect(result.content).toBe('<p>demo</p>')
  })
})
