import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { onOutput, type OutputEvent, resetOutputBus } from './output-bus.js'
import { StreamParser } from './ansi-stream.js'

describe('StreamParser', () => {
  let events: OutputEvent[]

  beforeEach(() => {
    events = []
    resetOutputBus()
    onOutput((e) => events.push(e))
  })

  afterEach(() => {
    resetOutputBus()
  })

  it('emits a line on \\n without a trailing partial', () => {
    new StreamParser('hono').feed('hello world\n')
    expect(events).toEqual([
      { type: 'line', member: 'hono', text: 'hello world' },
    ])
  })

  it('emits a partial then line when text arrives in two chunks', () => {
    const p = new StreamParser('hono')
    p.feed('hel')
    p.feed('lo\n')
    expect(events).toEqual([
      { type: 'partial', member: 'hono', text: 'hel' },
      { type: 'line', member: 'hono', text: 'hello' },
    ])
  })

  it('emits partial when no trailing newline', () => {
    new StreamParser('hono').feed('typing...')
    expect(events).toEqual([
      { type: 'partial', member: 'hono', text: 'typing...' },
    ])
  })

  it('joins chunks across feeds', () => {
    const p = new StreamParser('vite')
    p.feed('hel')
    p.feed('lo\n')
    expect(events.filter((e) => e.type === 'line')).toEqual([
      { type: 'line', member: 'vite', text: 'hello' },
    ])
  })

  it('treats CSI 2J as clear', () => {
    new StreamParser('nestjs').feed('before\n\x1b[2Jafter\n')
    expect(events.map((e) => e.type)).toContain('clear')
    const clearEvent = events.find((e) => e.type === 'clear')
    expect(clearEvent).toEqual({ type: 'clear', member: 'nestjs' })
  })

  it('treats CSI 3J as clear', () => {
    new StreamParser('nestjs').feed('\x1b[3J')
    expect(events).toEqual([{ type: 'clear', member: 'nestjs' }])
  })

  it('treats ESC c as clear', () => {
    new StreamParser('nestjs').feed('\x1bc')
    expect(events).toEqual([{ type: 'clear', member: 'nestjs' }])
  })

  it('treats CSI K as eraseLine', () => {
    new StreamParser('angular').feed('progress\r\x1b[Kdone\n')
    expect(events.map((e) => e.type)).toContain('eraseLine')
  })

  it('preserves SGR colour escapes inline', () => {
    new StreamParser('vite').feed('\x1b[36mcyan\x1b[0m\n')
    const lineEvent = events.find((e) => e.type === 'line') as
      | { type: 'line'; member: string; text: string }
      | undefined
    expect(lineEvent?.text).toBe('\x1b[36mcyan\x1b[0m')
  })

  it('drops cursor-position escapes silently', () => {
    new StreamParser('hono').feed('a\x1b[5;10Hb\n')
    const lineEvent = events.find((e) => e.type === 'line') as
      | { type: 'line'; text: string }
      | undefined
    expect(lineEvent?.text).toBe('ab')
  })

  it('handles \\r as eraseLine when not followed by \\n', () => {
    new StreamParser('angular').feed('progress\rrestart\n')
    const types = events.map((e) => e.type)
    expect(types).toContain('eraseLine')
    const lineEvent = events.find((e) => e.type === 'line') as
      | { type: 'line'; text: string }
      | undefined
    expect(lineEvent?.text).toBe('restart')
  })

  it('treats \\r\\n as a single line break', () => {
    new StreamParser('hono').feed('hello\r\nworld\r\n')
    const lines = events.filter((e) => e.type === 'line')
    expect(lines).toEqual([
      { type: 'line', member: 'hono', text: 'hello' },
      { type: 'line', member: 'hono', text: 'world' },
    ])
  })

  it('buffers an incomplete escape across feeds', () => {
    const p = new StreamParser('nestjs')
    p.feed('before\x1b')
    p.feed('[2Jafter\n')
    expect(events.some((e) => e.type === 'clear')).toBe(true)
    const lineEvent = events.find((e) => e.type === 'line' && e.text === 'after')
    expect(lineEvent).toBeDefined()
  })

  it('flushes partial line on end()', () => {
    const p = new StreamParser('hono')
    p.feed('no newline')
    p.end()
    const lines = events.filter((e) => e.type === 'line')
    expect(lines).toEqual([{ type: 'line', member: 'hono', text: 'no newline' }])
  })

  it('drops OSC title-set sequences', () => {
    new StreamParser('vite').feed('\x1b]0;title\x07ok\n')
    const lineEvent = events.find((e) => e.type === 'line') as
      | { type: 'line'; text: string }
      | undefined
    expect(lineEvent?.text).toBe('ok')
  })
})
