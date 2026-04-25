export const NESTJS_WIRE_ENV = 'SEAM_INTERNAL__NESTJS_ADAPTER'

export interface NestjsWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly distDir?: string
}

export function readNestjsWire(): NestjsWire | null {
  const raw = process.env[NESTJS_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as NestjsWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeNestjsWire(value: NestjsWire): string {
  return JSON.stringify(value)
}
