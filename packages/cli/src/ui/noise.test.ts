import { describe, expect, it } from 'vitest'
import { shouldDrop } from './noise.js'

describe('shouldDrop', () => {
  it('drops empty lines for any member', () => {
    expect(shouldDrop('hono', '')).toBe(true)
    expect(shouldDrop('hono', '   ')).toBe(true)
  })

  it('drops the angular `press h + enter` menu', () => {
    expect(shouldDrop('angular', '  ➜ press h + enter to show help')).toBe(true)
  })

  it('drops vite `press h + enter` if it ever leaks through', () => {
    expect(shouldDrop('vite', '  ➜ press h + enter to show help')).toBe(true)
  })

  it('keeps real angular output', () => {
    expect(shouldDrop('angular', '  Local: http://localhost:4574/')).toBe(false)
    expect(shouldDrop('angular', 'Initial chunk files | Names | Raw size')).toBe(false)
  })

  it('keeps hono listening line', () => {
    expect(shouldDrop('hono', '[hono] listening on http://127.0.0.1:39179')).toBe(false)
  })

  it('strips ANSI before matching', () => {
    expect(shouldDrop('angular', '\x1b[2m  ➜ press h + enter to show help\x1b[0m')).toBe(true)
  })
})
