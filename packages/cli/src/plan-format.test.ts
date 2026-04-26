import { describe, expect, it } from 'vitest'
import type { ResolvedTopology, Serveable } from '@seamstack/core'
import { formatPlan } from './plan-format.js'

const stub: Serveable = {
  kind: 'serveable',
  framework: 'stub',
  traits: { producesAssets: true, canHostAssets: false, defaultMountPath: '/' },
  dev: async () => ({ stop: () => {} }),
  build: async () => ({}),
  start: async () => ({ stop: () => {} }),
}

const fixture: ResolvedTopology = {
  publicHost: 'localhost',
  publicPort: 4567,
  publicUrl: 'http://localhost:4567',
  mode: 'dev',
  services: [
    {
      instance: stub,
      framework: 'vite',
      role: 'asset-source',
      mountPath: '/',
      routes: ['/'],
      devPort: 4567,
      prodPort: 0,
    },
    {
      instance: stub,
      framework: 'hono',
      role: 'asset-host',
      mountPath: '/api',
      routes: ['/api'],
      devPort: 41524,
      prodPort: 4567,
    },
  ],
  plugins: [],
  routing: { '/': 'vite', '/api': 'hono' },
}

const fixtureWithRoutesAndPlugins: ResolvedTopology = {
  ...fixture,
  services: [
    fixture.services[0]!,
    {
      ...fixture.services[1]!,
      routes: ['/api', '/graphql'],
    },
  ],
  plugins: [
    {
      instance: { kind: 'plugin', name: 'codegen', dev: () => ({ stop: () => {} }) },
      name: 'codegen',
      routes: [],
    },
    {
      instance: { kind: 'plugin', name: 'graphql', routes: ['/graphql'] },
      name: 'graphql',
      routes: ['/graphql'],
    },
  ],
  routing: { '/': 'vite', '/api': 'hono', '/graphql': 'hono' },
}

describe('formatPlan', () => {
  it('renders all phases', () => {
    expect(formatPlan(fixture)).toMatchSnapshot()
  })

  it('renders dev phase only', () => {
    expect(formatPlan(fixture, 'dev')).toMatchSnapshot()
  })

  it('renders start phase only', () => {
    expect(formatPlan(fixture, 'start')).toMatchSnapshot()
  })

  it('renders multi-route + plugins', () => {
    expect(formatPlan(fixtureWithRoutesAndPlugins)).toMatchSnapshot()
  })
})
