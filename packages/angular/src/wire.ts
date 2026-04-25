export const ANGULAR_WIRE_ENV = 'SEAM_INTERNAL__ANGULAR_ADAPTER'

export interface AngularWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly proxy?: Record<string, string>
}

export function readAngularWire(): AngularWire | null {
  const raw = process.env[ANGULAR_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AngularWire
    if (
      typeof parsed.port !== 'number' ||
      (parsed.mode !== 'dev' && parsed.mode !== 'prod')
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeAngularWire(value: AngularWire): string {
  return JSON.stringify(value)
}
