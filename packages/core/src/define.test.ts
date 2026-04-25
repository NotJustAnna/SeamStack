import { describe, expect, it } from 'vitest'
import { defineWeave } from './define.js'
import type { Serveable } from './types.js'

const stubServeable: Serveable = {
  kind: 'serveable',
  framework: 'stub',
  traits: { producesAssets: true, canHostAssets: false, defaultMountPath: '/' },
  dev: async () => ({ stop: () => {} }),
  build: async () => ({}),
  start: async () => ({ stop: () => {} }),
}

describe('defineWeave', () => {
  it('returns its input by reference (identity)', () => {
    const input = { fabric: [stubServeable], port: 3000 }
    expect(defineWeave(input)).toBe(input)
  })

  it('preserves nested fabric items', () => {
    const out = defineWeave({ fabric: [stubServeable] })
    expect(out.fabric).toHaveLength(1)
    expect(out.fabric[0]).toBe(stubServeable)
  })
})
