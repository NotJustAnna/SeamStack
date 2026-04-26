import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './router.js'

/**
 * Wire into your Express app:
 *
 *   import { trpcMiddleware } from './trpc/mount.js'
 *   app.use('/trpc', trpcMiddleware)
 */
export const trpcMiddleware = createExpressMiddleware({ router: appRouter })
