export const ASTRO_WIRE_ENV = 'SEAM_INTERNAL__ASTRO_ADAPTER'

export interface AstroWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly proxy?: Record<string, string>
}

export function readAstroWire(): AstroWire | null {
  const raw = process.env[ASTRO_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AstroWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeAstroWire(value: AstroWire): string {
  return JSON.stringify(value)
}
