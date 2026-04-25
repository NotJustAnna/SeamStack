export const FASTIFY_WIRE_ENV = 'SEAM_INTERNAL__FASTIFY_ADAPTER'

export interface FastifyWire {
  readonly mode: 'dev' | 'prod'
  readonly host?: string
  readonly port: number
  readonly distDir?: string
}

export function readFastifyWire(): FastifyWire | null {
  const raw = process.env[FASTIFY_WIRE_ENV]
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as FastifyWire
    if (typeof parsed.port !== 'number' || (parsed.mode !== 'dev' && parsed.mode !== 'prod')) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeFastifyWire(value: FastifyWire): string {
  return JSON.stringify(value)
}
