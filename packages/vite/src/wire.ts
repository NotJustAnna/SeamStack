export const VITE_WIRE_ENV = 'SEAM_INTERNAL__VITE_ADAPTER'

export interface ViteWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly proxy?: Record<string, string>
}

export function readViteWire(): ViteWire | null {
  const raw = process.env[VITE_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ViteWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeViteWire(value: ViteWire): string {
  return JSON.stringify(value)
}
