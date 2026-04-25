import type { WeaveInput } from './types.js'

/**
 * Define a SeamStack configuration.
 *
 * Identity function — returns its input unchanged. The value exists purely so
 * editors give you autocomplete and type-checking inside `seam.config.ts`.
 *
 * @example
 * ```ts
 * import { defineWeave } from '@seamstack/cli'
 * import vite from '@seamstack/vite/adapter'
 * import hono from '@seamstack/hono/adapter'
 *
 * export default defineWeave({
 *   fabric: [
 *     vite({ root: './client' }),
 *     hono({ entry: './server/index.ts' }),
 *   ],
 *   port: 4567,
 * })
 * ```
 */
export function defineWeave(input: WeaveInput): WeaveInput {
  return input
}
