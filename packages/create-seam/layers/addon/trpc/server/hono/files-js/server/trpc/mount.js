import { trpcServer } from '@hono/trpc-server'
import { appRouter } from './router.js'

/**
 * Wire into your Hono app:
 *
 *   import { trpcMiddleware } from './trpc/mount.js'
 *   app.use('/trpc/*', trpcMiddleware)
 */
export const trpcMiddleware = trpcServer({ router: appRouter })
