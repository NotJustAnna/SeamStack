export const ELYSIA_WIRE_ENV = 'SEAM_INTERNAL__ELYSIA_ADAPTER'

export interface ElysiaWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly distDir?: string
}

export function readElysiaWire(): ElysiaWire | null {
  const raw = process.env[ELYSIA_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ElysiaWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeElysiaWire(value: ElysiaWire): string {
  return JSON.stringify(value)
}
