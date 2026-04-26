import { describe, expect, it } from 'vitest'
import { jsExtensionFor, stripTypes, stripTypesFromHtml } from '../engine/strip-types.js'

describe('stripTypes', () => {
  it('removes type-only imports', () => {
    expect(stripTypes("import type { Foo } from './foo'\nimport { bar } from './bar'\n")).toBe(
      "import { bar } from './bar'\n",
    )
  })

  it('rewrites .ts/.tsx import paths', () => {
    expect(stripTypes("import x from './x.ts'")).toBe("import x from './x.js'")
    expect(stripTypes("import x from './x.tsx'")).toBe("import x from './x.jsx'")
  })

  it('strips simple type annotations on single params', () => {
    expect(stripTypes('function f(name: string) {}')).toBe('function f(name) {}')
  })

  it('strips `as Type` casts', () => {
    expect(stripTypes('const x = (y as string)')).toBe('const x = y')
    expect(stripTypes('const x = y as Promise<number>')).toBe('const x = y')
  })

  it('strips generic type-args before call', () => {
    expect(stripTypes('useState<string>("hi")')).toBe('useState("hi")')
  })
})

describe('stripTypesFromHtml', () => {
  it('rewrites main.tsx → main.jsx', () => {
    expect(stripTypesFromHtml('<script src="/main.tsx">')).toBe('<script src="/main.jsx">')
  })
})

describe('jsExtensionFor', () => {
  it('renames TS extensions', () => {
    expect(jsExtensionFor('main.tsx')).toBe('main.jsx')
    expect(jsExtensionFor('main.ts')).toBe('main.js')
    expect(jsExtensionFor('App.svelte')).toBe('App.svelte')
  })
})
