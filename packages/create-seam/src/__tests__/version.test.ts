import { describe, expect, it } from 'vitest'
import { compareVersions } from '../engine/version.js'

describe('compareVersions', () => {
  it('handles caret ranges', () => {
    expect(compareVersions('^1.0.0', '^2.0.0')).toBeLessThan(0)
    expect(compareVersions('^2.0.0', '^1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('^1.2.3', '^1.2.3')).toBe(0)
  })

  it('treats workspace:* as the highest rank', () => {
    expect(compareVersions('^1.0.0', 'workspace:*')).toBeLessThan(0)
    expect(compareVersions('workspace:*', '^99.0.0')).toBeGreaterThan(0)
  })

  it('compares minor and patch', () => {
    expect(compareVersions('^1.2.3', '^1.3.0')).toBeLessThan(0)
    expect(compareVersions('^1.2.4', '^1.2.3')).toBeGreaterThan(0)
  })
})
