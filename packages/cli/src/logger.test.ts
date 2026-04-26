import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLogLevel, isVerbose, log, setLogLevel } from './logger.js'

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    setLogLevel('normal')
  })

  afterEach(() => {
    logSpy.mockRestore()
    setLogLevel('normal')
  })

  it('starts at normal level', () => {
    expect(getLogLevel()).toBe('normal')
    expect(isVerbose()).toBe(false)
  })

  it('toggles to verbose', () => {
    setLogLevel('verbose')
    expect(getLogLevel()).toBe('verbose')
    expect(isVerbose()).toBe(true)
  })

  it('debug() is silent in normal mode', () => {
    log.debug('hidden')
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('debug() emits in verbose mode', () => {
    setLogLevel('verbose')
    log.debug('shown')
    expect(logSpy).toHaveBeenCalledOnce()
    const printed = logSpy.mock.calls[0]?.[0] as string
    expect(printed).toContain('shown')
    expect(printed).toContain('seam:debug')
  })

  it('info/success always emit', () => {
    log.info('hi')
    log.success('done')
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  it('ready() includes ms and url', () => {
    log.ready('http://localhost:4567', 1234)
    const printed = logSpy.mock.calls[0]?.[0] as string
    expect(printed).toContain('1234ms')
    expect(printed).toContain('http://localhost:4567')
  })

  it("readyVia() points to the framework's url", () => {
    log.readyVia('astro', 447)
    const printed = logSpy.mock.calls[0]?.[0] as string
    expect(printed).toContain('447ms')
    expect(printed).toContain('astro')
    expect(printed).toContain("'s url")
  })

  it('prefixes lines with an HH:MM:SS timestamp', () => {
    log.info('hi')
    const printed = logSpy.mock.calls[0]?.[0] as string
    expect(printed).toMatch(/\d{2}:\d{2}:\d{2}/)
  })
})
