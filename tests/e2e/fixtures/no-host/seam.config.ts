import { defineWeave } from '@seamstack/cli'
import vite from '@seamstack/vite/adapter'

export default defineWeave({
  fabric: [vite()],
})
