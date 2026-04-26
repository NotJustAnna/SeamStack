import pc from 'picocolors'

export type LogLevel = 'normal' | 'verbose'

let currentLevel: LogLevel = 'normal'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

export function isVerbose(): boolean {
  return currentLevel === 'verbose'
}

const ORANGE_OPEN = '\x1b[38;5;208m'
const ANSI_RESET = '\x1b[0m'
const orange = (s: string): string =>
  pc.isColorSupported ? `${ORANGE_OPEN}${s}${ANSI_RESET}` : s

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
const timestamp = (): string => {
  const d = new Date()
  return pc.dim(`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`)
}

const tag = () => orange('[seam]')
const debugTag = () => pc.dim(orange('[seam:debug]'))

const prefix = () => `${timestamp()} ${tag()}`
const debugPrefix = () => `${timestamp()} ${debugTag()}`

export const log = {
  info(msg: string): void {
    console.log(`${prefix()} ${msg}`)
  },
  success(msg: string): void {
    console.log(`${prefix()} ${pc.green('✓')} ${msg}`)
  },
  warn(msg: string): void {
    console.warn(`${prefix()} ${pc.yellow('⚠')} ${msg}`)
  },
  error(msg: string): void {
    console.error(`${prefix()} ${pc.red('✗')} ${msg}`)
  },
  debug(msg: string): void {
    if (currentLevel === 'verbose') console.log(`${debugPrefix()} ${msg}`)
  },
  url(label: string, url: string): void {
    console.log(`${prefix()} ${label} ${pc.cyan(url)}`)
  },
  ready(url: string, ms: number): void {
    console.log(
      `${prefix()} ${pc.green('✓')} ready in ${pc.bold(`${ms}ms`)} ${pc.dim('→')} ${pc.cyan(pc.bold(url))}`,
    )
  },
  readyVia(framework: string, ms: number): void {
    console.log(
      `${prefix()} ${pc.green('✓')} ready in ${pc.bold(`${ms}ms`)} ${pc.dim('—')} use ${orange(pc.bold(framework))}'s url`,
    )
  },
}

export { pc }
