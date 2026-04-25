import { EventEmitter } from 'node:events'

/**
 * Events emitted by adapters into the seam output bus.
 *
 * The CLI (or any other consumer) subscribes via {@link onOutput} and reduces
 * these events into a per-member render model. Adapters push events via
 * {@link pushOutput} (or, more commonly, by piping their child stdio through
 * `wrapStream(member, stream)` in `ansi-stream.ts`).
 *
 * Semantics for a reducer:
 * - `line`     append to that member's committed lines, clear its live line
 * - `partial`  REPLACE that member's live line with `text`
 * - `clear`    drop all of that member's committed lines and live line
 * - `eraseLine` drop that member's live line only
 */
export type OutputEvent =
  | { type: 'line'; member: string; text: string }
  | { type: 'partial'; member: string; text: string }
  | { type: 'clear'; member: string }
  | { type: 'eraseLine'; member: string }

const bus = new EventEmitter()
bus.setMaxListeners(50)

const EVENT = 'event'

/** Push an event to every subscriber. Adapters call this. */
export function pushOutput(event: OutputEvent): void {
  bus.emit(EVENT, event)
}

/** Subscribe. Returns an unsubscribe fn. The CLI's Ink store calls this. */
export function onOutput(handler: (event: OutputEvent) => void): () => void {
  bus.on(EVENT, handler)
  return () => {
    bus.off(EVENT, handler)
  }
}

/** Drop all subscribers. Used in tests. */
export function resetOutputBus(): void {
  bus.removeAllListeners(EVENT)
}
