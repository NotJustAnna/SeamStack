export const HONO_WIRE_ENV = 'SEAM_INTERNAL__HONO_ADAPTER'

export interface HonoWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly distDir?: string
}

export function readHonoWire(): HonoWire | null {
  const raw = process.env[HONO_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as HonoWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeHonoWire(value: HonoWire): string {
  return JSON.stringify(value)
}
