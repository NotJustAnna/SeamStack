export const EXPRESS_WIRE_ENV = 'SEAM_INTERNAL__EXPRESS_ADAPTER'

export interface ExpressWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly distDir?: string
}

export function readExpressWire(): ExpressWire | null {
  const raw = process.env[EXPRESS_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ExpressWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeExpressWire(value: ExpressWire): string {
  return JSON.stringify(value)
}
