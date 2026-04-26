import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushOutput, resetOutputBus } from '@seamstack/core'
import { Store } from './store.js'

const baseSeam = {
  mode: 'dev' as const,
  phase: 'starting' as const,
  startedAt: 0,
  publicUrl: 'http://localhost:4567',
  members: ['vite', 'hono'],
}

describe('Store', () => {
  let store: Store

  beforeEach(() => {
    resetOutputBus()
    store = new Store(baseSeam)
    store.start()
  })

  afterEach(() => {
    store.stop()
    resetOutputBus()
  })

  it('appends committed lines on `line` events', () => {
    pushOutput({ type: 'line', member: 'hono', text: 'listening on http://...' })
    expect(store.state.committed).toHaveLength(1)
    expect(store.state.committed[0]).toMatchObject({
      member: 'hono',
      text: 'listening on http://...',
    })
  })

  it('replaces live line on `partial` and clears on `line`', () => {
    pushOutput({ type: 'partial', member: 'vite', text: 'optimizing...' })
    expect(store.state.live.get('vite')).toBe('optimizing...')
    pushOutput({ type: 'line', member: 'vite', text: 'optimized' })
    expect(store.state.live.has('vite')).toBe(false)
    expect(store.state.committed.at(-1)?.text).toBe('optimized')
  })

  it('drops a member\'s live line on `clear` but keeps committed lines from any member', () => {
    pushOutput({ type: 'line', member: 'vite', text: 'vite line' })
    pushOutput({ type: 'line', member: 'nestjs', text: 'nest line' })
    pushOutput({ type: 'partial', member: 'nestjs', text: 'nest live' })
    pushOutput({ type: 'clear', member: 'nestjs' })
    expect(store.state.live.has('nestjs')).toBe(false)
    expect(store.state.committed.map((c) => c.text)).toEqual(['vite line', 'nest line'])
  })

  it('drops noisy lines via shouldDrop', () => {
    pushOutput({ type: 'line', member: 'angular', text: '  ➜ press h + enter to show help' })
    expect(store.state.committed).toHaveLength(0)
  })

  it('flips phase to ready and records via + ms', () => {
    store.setReady('astro', 463)
    expect(store.state.seam.phase).toBe('ready')
    expect(store.state.seam.via).toBe('astro')
    expect(store.state.seam.readyMs).toBe(463)
  })

  it('notifies subscribers on every change', () => {
    let calls = 0
    const unsub = store.subscribe(() => {
      calls++
    })
    pushOutput({ type: 'line', member: 'hono', text: 'one' })
    pushOutput({ type: 'partial', member: 'hono', text: 'two' })
    expect(calls).toBe(2)
    unsub()
    pushOutput({ type: 'line', member: 'hono', text: 'three' })
    expect(calls).toBe(2)
  })
})
