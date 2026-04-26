import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'
import hono from '@seamstack/hono/adapter'

export default defineWeave({
  fabric: [vite(), vite(), hono({ entry: './server/index.ts' })],
})
