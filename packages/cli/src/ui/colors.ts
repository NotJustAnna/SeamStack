import pc from 'picocolors'

const ORANGE_OPEN = '\x1b[38;5;208m'
const ANSI_RESET = '\x1b[0m'
const orange = (s: string): string =>
  pc.isColorSupported ? `${ORANGE_OPEN}${s}${ANSI_RESET}` : s

export type Colorize = (s: string) => string

const palette: Record<string, Colorize> = {
  seam: orange,
  vite: pc.cyan,
  astro: pc.greenBright,
  angular: pc.red,
  hono: pc.yellow,
  express: pc.gray,
  fastify: pc.blue,
  elysia: pc.magenta,
  nestjs: pc.green,
}

const defaultColor: Colorize = pc.white

export function memberColor(member: string): Colorize {
  return palette[member] ?? defaultColor
}

export const inkColor: Record<string, string> = {
  seam: 'orange',
  vite: 'cyan',
  astro: 'greenBright',
  angular: 'red',
  hono: 'yellow',
  express: 'gray',
  fastify: 'blue',
  elysia: 'magenta',
  nestjs: 'green',
}

const inkHexFallback: Record<string, string> = {
  orange: '#ff8700',
}

export function memberInkColor(member: string): string {
  const name = inkColor[member] ?? 'white'
  return inkHexFallback[name] ?? name
}
